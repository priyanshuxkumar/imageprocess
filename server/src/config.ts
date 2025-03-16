import multer from "multer";
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "";

const s3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

const storage = multer.memoryStorage();

const upload = multer({
    storage
});

const cookieOptions = {
    httpOnly : true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24,
    sameSite: 'strict' as 'strict',
    path: '/'
  }
  
  

export {s3 , upload, JWT_SECRET , cookieOptions};
