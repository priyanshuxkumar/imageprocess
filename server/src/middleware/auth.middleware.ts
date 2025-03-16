import { NextFunction , Request , Response} from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config";

export const authMiddleware = (req: Request , res: Response , next: NextFunction) => {
    try {
        const token = req.cookies._token_;
        if(!token){
            res.status(401).json({message: "Unauthenticated!. Please login"});
            return;
        }

        const payload = jwt.verify(token, JWT_SECRET);
        if(typeof payload !== 'string' && payload.id){
            req.id = payload.id;
            next();
        }else {
            res.status(401).json({message: "Unauthorized Access"});
            return;
        }
    } catch (error) {
        console.log(error)
        res.status(500).json({message: "Something went wrong"});
    }
}
