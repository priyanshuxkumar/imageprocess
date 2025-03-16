import sharp = require("sharp");

async function getMetadata(imageBuffer: any) {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    return metadata;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(error.message);
    } else {
      throw new Error("Something went wrong");
    }
  }
}

async function transform(sharpInstance: any, body: any) {
  try {
    if (!sharpInstance) {
      throw new Error("Invalid image");
    }

    if (body.crop) {
      try {
        sharpInstance = await sharpInstance.extract({
          width: body.crop.width,
          height: body.crop.height,
          left: body.crop.x,
          top: body.crop.y,
        });
      } catch (error) {
        if (error instanceof Error) {
          console.log("error crop fn", error.message);
        } else {
          console.log("error crop fn", error);
        }
      }
    }

    if (body.resize) {
      try {
        sharpInstance = await sharpInstance.resize({
          width: body.resize.width,
          height: body.resize.height,
        });
      } catch (error) {
        if (error instanceof Error) {
          console.log("error resize fn", error.message);
        } else {
          console.log("error resize fn", error);
        }
      }
    }

    if (body.filters) {
      if (body.filters.grayscale) {
        try {
          sharpInstance = await sharpInstance.grayscale();
        } catch (error) {
          if (error instanceof Error) {
            console.log("error grayscale fn", error.message);
          } else {
            console.log("error grayscale fn", error);
          }
        }
      } else if (body.filters.sepia) {
        try {
          sharpInstance = await sharpInstance.sepia();
        } catch (error) {
          if (error instanceof Error) {
            console.log("error sepia fn", error.message);
          } else {
            console.log("error sepia fn", error);
          }
        }
      }
    }

    const output = await sharpInstance.toBuffer({ resolveWithObject: true });
    return output;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(error.message);
    } else {
      throw new Error("Something went wrong");
    }
  }
}

export { getMetadata, transform };
