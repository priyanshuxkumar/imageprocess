import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import prisma from "../db";
import { s3 } from "../config";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getMetadata } from "../helper";
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

const transformImage = async (req: Request, res: Response) => {
  const imageId = req.params.id;
  const body = req.body;

  // Parsing the body with zod
  const parsedbody = TransformImageSchema.safeParse(body);
  if (!parsedbody.success) {
    res.status(400).json({ message: parsedbody.error.message ?? "Invalid request" });
    return;
  }
  try {
    const taskId = uuidv4();
    redisClient.rPush("imageProcessingQueue",
      JSON.stringify({
        taskId,
        imageId,
        transformPayload: parsedbody.data,
      }),
    );
    res.status(200).json({ message: "Image is being processed", taskId });
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
 * Check the status of the transform image
 * This allows clients to repeatedly check the status of their image processing request.
 */
const checkTransformStatus = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const processedImage = await redisClient.get(`processed:${taskId}`);
    if(!processedImage) {
      res.status(200).json({ status: "Pending", message: "Please wait while we are processing your image" });
      return;
    }
    res.status(200).json({ status: "Completed", image: JSON.parse(processedImage) });
  } catch (error) {
    if(error instanceof Error) {
      res.status(500).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Something went wrong" });
    }
  }
}

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
   /** Check if the transform images are cached on redis */
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
   /** Cache the transform images on redis */
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


export {
  uploadImage,
  transformImage,
  checkTransformStatus,
  getImageById,
  getAllImages,
  getTransformedImages,
  destroyImage,
};