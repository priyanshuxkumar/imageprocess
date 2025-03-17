import z, { number } from "zod";

export const EmailSchema = z.string().email("Invalid Email format");
export const PasswordSchema = z
  .string()
  .min(8, { message: "Enter minimum 8 characters password" });

export const SignupSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  email: EmailSchema,
  password: PasswordSchema,
});

export const SigninSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

export const TransformImageSchema = z.object({
    crop: z.object({
        width: z.number(),
        height: z.number(),
        x: z.number(),
        y: z.number(),
    }).optional(),
    resize: z.object({
        width: z.number(),
        height: z.number(),
    }).optional(),
    rotate: z.object({
        angle: z.number(),
            background: z.object({
                r: z.number().default(0),
                g: z.number().default(0),
                b: z.number().default(0),
                alpha: z.number().default(0),
            }).default({ r: 0, g: 0, b: 0, alpha: 0 }),
    }).optional(),
    blur: z.number().optional(),
    filters: z.object({
        grayscale: z.boolean(),
        sepia: z.boolean(),
    }).optional(),
});

export type TransformImageSchemaType = z.infer<typeof TransformImageSchema>;
