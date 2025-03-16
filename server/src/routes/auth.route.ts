import { Router } from 'express';
import {  loginUser, signupUser } from '../controllers/auth.controller';

const router = Router()

router.route("/signup").post(signupUser);

router.route("/signin").post(loginUser);

export const authRouter = router;