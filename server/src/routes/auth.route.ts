import { Router } from 'express';
import {  getCurrentUser, loginUser, logoutUser, signupUser } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router()

router.route("/signup").post(signupUser);

router.route("/signin").post(loginUser);

router.route("/").get(authMiddleware ,getCurrentUser);

router.route("/logout").post(authMiddleware ,logoutUser);

export const authRouter = router;