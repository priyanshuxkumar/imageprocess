import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { s3 } from "../../config";
import prisma from "../../db";
import { redisClient } from "../redis";
import sharp from "sharp";
import { transform } from "../../helper";
import { TransformImageSchemaType } from "../../types";


type ImageProcessingData = {
    taskId: string;
    imageId: string;
    transformPayload: TransformImageSchemaType;
}

const imageProcessingWorker = async () => {
    console.log("Queue Started")
    try {
        while (true) {
            let data : ImageProcessingData | string | null = await redisClient.lPop('imageProcessingQueue');
            if(!data) {
                await new Promise(resolve => setTimeout(resolve, 1500));
                continue;
            }
            try {
                data = JSON.parse(data) as ImageProcessingData;
            } catch (error) {
                console.log("Error in parsing data", error)
                continue;
            }

            const { taskId, imageId, transformPayload } = data as ImageProcessingData;            
            
            if (!taskId || !imageId || !transformPayload) {
                console.log("Invalid data skipping")
                continue;
            }
            
            let imageBuffer; // buffer of the image
            let image; // image object
    
            let redisImageBuffer:  string | null | Buffer = await redisClient.get(`imageIdToBuffer:${imageId}`);
    
            image = await redisClient.get(`imageIdToImage:${imageId}`);
            if (image) {
                try {
                    image = JSON.parse(image);
                } catch (error) {
                    console.error("Failed to parse image:", image, error);
                    image = null;
                }
            }
    
            if(redisImageBuffer){
                try {
                    redisImageBuffer = Buffer.from(JSON.parse(redisImageBuffer));
                } catch (error) {
                    console.error("Failed to parse redisImageBuffer:", redisImageBuffer, error);
                    redisImageBuffer = null;
                }
            }else {
                image = await prisma.image.findFirst({
                    where: {
                        id: imageId,
                    },
                });
    
                if (!image) {
                    console.log("Image not found")
                    continue;
                }
    
                const getObjectParams = {
                    Bucket: process.env.AWS_BUCKET_NAME!,
                    Key: image.key,
                };
    
                const s3Response = await s3.send(new GetObjectCommand(getObjectParams));
                if (!s3Response.Body) {
                    console.log("Image not found in s3");
                    continue;
                }
                const chunks: Buffer[] = [];
                for await (const chunk of s3Response.Body as Readable) {
                  chunks.push(Buffer.from(chunk));
                }
                imageBuffer = Buffer.concat(chunks);
            }
    
            /** Creating a sharp instance with the image buffer */
            let sharpInstance = sharp(redisImageBuffer ?? imageBuffer);
    
            /** Calling the image transform fn with sharp instance with transform payload */
            const output = await transform(sharpInstance, transformPayload);
    
    
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
    
            await redisClient.set(`processed:${taskId}`, JSON.stringify({
                id: transformedImage.id,
                url: transformedImage.url,
                metadata: JSON.stringify(transformedImage.metadata),
            }))
        }
    } catch (error) {
        console.log("Error in image processing worker",error)
    }
};


export default imageProcessingWorker;

