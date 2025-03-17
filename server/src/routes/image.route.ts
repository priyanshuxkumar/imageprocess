import { Router } from "express";
import { uploadImage, transformImage, getImageById, getTransformedImages, destroyImage, getAllImages } from "../controllers/image.controller";
import { upload } from "../config";
import { authMiddleware } from "../middleware/auth.middleware";


const router = Router();

router.route("/").post(authMiddleware, upload.single("file"), uploadImage);

router.route("/").get(authMiddleware, getAllImages);

router.route("/:id/transform").post(authMiddleware, transformImage);

router.route("/:id").get(authMiddleware, getImageById);

router.route("/:id/transforms").get(authMiddleware, getTransformedImages);

router.route("/:id").delete(authMiddleware, destroyImage);

export const imageRouter = router;
