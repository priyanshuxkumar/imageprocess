import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { imageRouter } from "./routes/image.route";
import { authRouter } from "./routes/auth.route";
import imageProcessingWorker from "./services/process-worker";
const app = express();
const PORT = process.env.PORT || 8000;

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(
    {
        origin: "http://localhost:3000",
        credentials: true,
    }
));

imageProcessingWorker();

app.use("/api/auth", authRouter)
app.use("/api/image", imageRouter);


app.listen(PORT , () => console.log("Server is running on PORT",PORT))