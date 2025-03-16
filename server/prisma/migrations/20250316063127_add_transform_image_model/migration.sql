-- CreateTable
CREATE TABLE "TransformImage" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "TransformImage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TransformImage" ADD CONSTRAINT "TransformImage_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
