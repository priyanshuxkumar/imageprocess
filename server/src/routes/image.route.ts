import { Router } from "express";
import { uploadImage, transformImage } from "../controllers/image.controller";
import { upload } from "../config";
import { authMiddleware } from "../middleware/auth.middleware";


const router = Router();

router.route("/").post(authMiddleware, upload.single("file"), uploadImage);

router.route("/:id/transform").post(authMiddleware, transformImage);

export const imageRouter = router;
