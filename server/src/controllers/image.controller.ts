import { Request, Response } from "express";
import { Readable } from "stream";
import sharp from "sharp";
import prisma from "../db";
import { s3 } from "../config";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getMetadata, transform } from "../helper";
import { redisClient } from "../services/redis";
import { TransformImageSchema } from "../types";
import { ZodError } from "zod";
import { Image, TransformImage} from "@prisma/client";
import { PrismaClientValidationError } from "@prisma/client/runtime/library";



const uploadImage = async (req: Request, res: Response) => {
  const userId = req.id as number;
  try {
    if (!req.file) {
      res.status(400).json({ message: "Please upload image file" });
      return;
    }
    const file = req.file;
    const metadata: sharp.Metadata | undefined = await getMetadata(file.buffer);

    const key = `uploads/${Date.now()}_${file.originalname}`;
    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    await s3.send(new PutObjectCommand(uploadParams));

    if (metadata) {
      const image = await prisma.image.create({
        data: {
          url: `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`,
          metadata: JSON.stringify(metadata),
          key,
          userId,
        },
      });

      /** Cache the image on redis */
      /** Image id to buffer */
      await redisClient.set(`imageIdToBuffer:${image.id}`,JSON.stringify(file.buffer));

      /** Image id to image */
      await redisClient.set(`imageIdToImage:${image.id}`,JSON.stringify(image));

      res.status(200).json({ message: "Upload successfully!" });
    } else {
      res.status(400).json({ message: "Something went wrong while uploading image" });
      return;
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({ message: error.message });
    } else if (error instanceof PrismaClientValidationError) {
      res.status(500).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Something went wrong" });
    }
  }
};

/**
 * Transform image
 */
const transformImage = async (req: Request, res: Response) => {
  const imageId = req.params.id;
  const body = req.body;

  const parsedData = TransformImageSchema.safeParse(body);
  if (!parsedData.success) {
    res.status(400).json({ message: parsedData.error.message ?? "Invalid request" });
    return;
  }
  try {
    let imageBuffer;
    let image;

    let redisBuffer: string | null | Buffer = await redisClient.get(`imageIdToBuffer:${imageId}`);

    image = await redisClient.get(`imageIdToImage:${imageId}`);
    if (image) {
      image = JSON.parse(image);
    }

    if (redisBuffer) {
      redisBuffer = Buffer.from(JSON.parse(redisBuffer));
    } else {
      image = await prisma.image.findFirst({
        where: {
          id: imageId,
        },
      });

      if (!image) {
        res.status(404).json({ message: "Image not found or already deleted" });
        return;
      }

      const getObjectParams = {
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: image.key,
      };

      const s3Response = await s3.send(new GetObjectCommand(getObjectParams));

      if (!s3Response.Body) {
        res.status(404).json({ message: "Image not found or already deleted" });
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of s3Response.Body as Readable) {
        chunks.push(Buffer.from(chunk));
      }
      imageBuffer = Buffer.concat(chunks);
    }

    /** Creating a sharp instance with the image buffer */
    let sharpInstance = sharp(redisBuffer ?? imageBuffer);

    /** Calling the image transform fn with sharp instance with transform payload */
    const output = await transform(sharpInstance, body);

    let outputFormat = image?.key?.split(".").pop() || "jpeg";
    const transformedKey = `transformed/${Date.now()}_${image?.key.split("/").pop()}`;

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: transformedKey,
      Body: output.data,
      ContentType: `image/${outputFormat}`,
    };
    await s3.send(new PutObjectCommand(uploadParams));

    const transformedImage = await prisma.transformImage.create({
      data: {
        url: `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${transformedKey}`,
        metadata: JSON.stringify(output.info),
        key: transformedKey,
        imageId: imageId,
      },
    });

    /** Delete the transform images of this image from redis cache */
    await redisClient.del(`imageIdToTransformImages:${imageId}`);

    res.status(200).json({
      id: transformedImage.id,
      url: transformedImage.url,
      metadata: JSON.stringify(transformedImage.metadata),
      message: "Image transformed successfully",
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({ message: error.message });
    } else if (error instanceof ZodError) {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Something went wrong" });
    }
  }
};

/**
 * Get image by id
 */
const getImageById = async (req: Request, res: Response) => {
  const imageId = req.params.id;
  try {
    const cacheData = await redisClient.get(`imageId:${imageId}`);
    if(cacheData) {
      res.status(200).json(JSON.parse(cacheData));
      return;
    }
    const image : Pick<Image, "id" | "url" | "createdAt"> | null = await prisma.image.findUnique({
      where: {
        id: imageId,
        isDeleted: false,
      },
      select: {
        id: true,
        url: true,
        createdAt: true,
      }
    });
    if(!image) {
      res.status(404).json({ message: "Image not found or already deleted" });
      return;
    }
    await redisClient.set(`imageId:${imageId}`,JSON.stringify(image));
    res.status(200).json(image);
  } catch (error : unknown) {
    if(error instanceof PrismaClientValidationError) {
      res.status(500).json({ message: error.message });
    } else if (error instanceof Error) { 
      res.status(500).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Something went wrong" });
    }
  }
}

/**
 * Get all images of a user
 */
const getAllImages =  async(req: Request, res: Response) => {
  const userId = req.id as number;
  try {
    const cacheData = await redisClient.get(`userIdToImages:${userId}`);
    if(cacheData) {
      res.status(200).json(JSON.parse(cacheData));
      return;
    }
    const images : Pick<Image, "id" | "url" | "createdAt">[] = await prisma.image.findMany({
      where: {
        userId,
        isDeleted: false,
      },
      select: {
        id: true,
        url: true,
        createdAt: true,
      }
    });
    await redisClient.setEx(`userIdToImages:${userId}`,30, JSON.stringify(images));

    res.status(200).json(images);
  } catch (error : unknown) {
    if(error instanceof PrismaClientValidationError) {
      res.status(500).json({ message: error.message });
    } else if (error instanceof Error) { 
      res.status(500).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Something went wrong" });
    }
  }
}


/**
 * Get all transform images of a image by image id
 */
const getTransformedImages = async (req: Request, res: Response) => {
 try {
   const imageId = req.params.id;
   const cacheData = await redisClient.get(`imageIdToTransformImages:${imageId}`);
   if(cacheData) {
    res.status(200).json(JSON.parse(cacheData));
    return;
   }
   const images : TransformImage[] = await prisma.transformImage.findMany({
    where : {
      imageId,
      image: {
        isDeleted: false,
      }
    }
   })
   await redisClient.set(`imageIdToTransformImages:${imageId}`,JSON.stringify(images));
   res.status(200).json(images);
 } catch (error) {
   if(error instanceof PrismaClientValidationError) {
    res.status(500).json({ message: error.message });
   } else if (error instanceof Error) { 
    res.status(500).json({ message: error.message });
   } else {
    res.status(500).json({ message: "Something went wrong" });
   }
 }
}

const destroyImage = async (req: Request, res: Response) => {
  const imageId = req.params.id;
  try {
    const image = await prisma.image.findUnique({
      where: {
        id: imageId,
        isDeleted: false,
      },
    });
    if(!image) {
      res.status(404).json({ message: "Image not found or already deleted" });
      return;
    }
    await prisma.image.update({
      where: {
        id: imageId,
        isDeleted: false,
      },
      data: { 
        isDeleted: true 
      },
    });

    await redisClient.del(`imageId:${imageId}`);
    await redisClient.del(`imageIdToBuffer:${imageId}`);
    await redisClient.del(`imageIdToImage:${imageId}`);
    await redisClient.del(`imageIdToTransformImages:${imageId}`);

    res.status(200).json({ message: "Image deleted successfully" , imageId : image.id});
  } catch (error : unknown) {
    if(error instanceof PrismaClientValidationError) {
      res.status(500).json({ message: error.message });
    } else if (error instanceof Error) { 
      res.status(500).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Something went wrong" });
    }
  }
}


export { uploadImage, transformImage, getImageById, getAllImages, getTransformedImages, destroyImage };