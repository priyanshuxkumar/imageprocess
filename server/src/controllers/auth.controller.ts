import { Request , Response} from "express";
import { SigninSchema, SignupSchema } from "../types";
import { Prisma, User } from "@prisma/client";
import prisma from "../db";
import { cookieOptions, JWT_SECRET } from "../config";
import { ZodError } from "zod";
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken";
import { redisClient } from "../services/redis";

const signupUser = async(req: Request , res: Response) => {
    try {
        const body = req.body;
        const parsedData = SignupSchema.safeParse(body)
        if(!parsedData.success){
            res.status(400).json({message: parsedData.error.issues[0].message ?? "Invalid Input"});
            return;
        }
        const user : User | null = await prisma.user.findFirst({
            where: {
                email: parsedData.data.email
            }
        })

        if(user){
            res.status(400).json({message: "User already exists"});
            return;
        }
        
        const hashedPassword = await bcrypt.hash(parsedData.data.password, 10);

        const newUser = await prisma.user.create({
            data: {
                ...parsedData.data,
                password: hashedPassword
            }
        })

        const a_token = jwt.sign({id: newUser.id}, JWT_SECRET, {expiresIn: '24h'})

        res.cookie('_token_', a_token, cookieOptions);

        res.status(200).json({message: 'Signup successfull!'})
    } catch (error : unknown) {
        if(error instanceof Prisma.PrismaClientKnownRequestError) {
            res.status(404).json({message: "User not found"});
            return;
        }
        if(error instanceof ZodError) {
            res.status(400).json({message: error.errors[0]?.message || "Invalid input"});
            return;
        }
        if(error instanceof Error) {
            res.status(500).json({message: error.message});
            return;
        }
        res.status(500).json({message : 'Something went wrong'}); 
    }
}

const loginUser = async(req: Request , res: Response) => {
    try {
        const body = req.body;
        const parsedData = SigninSchema.safeParse(body)
        if(!parsedData.success){
            res.status(400).json({message: parsedData.error.issues[0].message ?? "Invalid Input"});
            return;
        }
        const user : User | null = await prisma.user.findFirst({
            where: {
                email: parsedData.data.email
            }
        })

        if(!user){
            res.status(404).json({message : 'Invalid credentials'});
            return;
        }

        const isPasswordCorrect = await bcrypt.compare(parsedData.data.password , user.password)
        if(!isPasswordCorrect){
            res.status(403).json({mesasge: 'Invalid crendentials'});
            return;
        }

        const a_token = jwt.sign({id: user.id}, JWT_SECRET, {expiresIn: '24h'})

        res.cookie('_token_', a_token, cookieOptions);

        res.status(200).json({message: 'Signin successfull!'})
    } catch (error : unknown) {
        if(error instanceof Prisma.PrismaClientKnownRequestError) {
            res.status(404).json({message: "User not found"});
            return;
        }
        if(error instanceof ZodError) {
            res.status(400).json({message: error.errors[0]?.message || "Invalid input"});
            return;
        }
        if(error instanceof Error) {
            res.status(500).json({message: error.message});
            return;
        }
        res.status(500).json({message : 'Something went wrong'}); 
    }
}

const getCurrentUser = async(req: Request , res: Response) => {
    try {
        const userId = req.id as number;
        const cacheData = await redisClient.get(`userId:${userId}`);
        if(cacheData) {
            res.status(200).json(JSON.parse(cacheData));
            return;
        }
        const user : Pick<User, "id" | "name" | "createdAt"> | null = await prisma.user.findFirst({
            where: {
                id: userId
            },
            select: {
                id: true,
                name: true,
                createdAt: true,
            }
        })
        if(!user) {
            res.status(404).json({message: 'User not found'});
            return;
        }
        await redisClient.set(`userId:${userId}`, JSON.stringify(user));
        res.status(200).json(user);
    } catch (error : unknown) {
        if(error instanceof Prisma.PrismaClientKnownRequestError) {
            res.status(404).json({message: "User not found"});  
            return;
        }
        if(error instanceof Error) {
            res.status(500).json({message: error.message});
            return;
        }
        res.status(500).json({message: 'Something went wrong'});
    }
}


const logoutUser = async(req: Request , res: Response) => {
   try {
        const userId = req.id as number;
        await redisClient.del(`userId:${userId}`);
        res.clearCookie('_token_' , cookieOptions);
        res.status(200).json({message: 'Logout successfull!'});
   } catch (error : unknown) {
        if(error instanceof Error) {
            res.status(500).json({message: error.message});
            return;
        }
        res.status(500).json({message: 'Something went wrong'});
   }
}

export {signupUser, loginUser, logoutUser, getCurrentUser};