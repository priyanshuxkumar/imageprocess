import express from "express";
import cors from "cors";
import { imageRouter } from "./routes/image.route";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors())



app.use("/api/image", imageRouter);


app.listen(PORT , () => console.log("Server is running on PORT",PORT))