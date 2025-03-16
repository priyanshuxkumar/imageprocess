import z from 'zod';

export const EmailSchema = z.string().email('Invalid Email format'); 
export const PasswordSchema = z.string().min(8, { message: 'Enter minimum 8 characters password' })


export const SignupSchema = z.object({
    name: z.string().min(1, { message: 'Name is required' }),
    email: EmailSchema,
    password: PasswordSchema,
})

export const SigninSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
})

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
    filters: z.object({
        grayscale: z.boolean(),
        sepia: z.boolean(),
    }).optional(),
})

export type TransformImageSchemaType = z.infer<typeof TransformImageSchema>;