const Joi = require("joi");

const userSchema = Joi.object({
  name: Joi.string().required().messages({
    "string.empty": "Name is required",
    "any.required": "Name is required",
  }),

  email: Joi.string().email().required().messages({
    "string.email": "Invalid email format",
    "string.empty": "Email is required",
    "any.required": "Email is required",
  }),

  password: Joi.string().min(6).required().messages({
    "string.min": "Password must be at least 6 characters long",
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),

  role: Joi.string().valid("teacher", "student").required().messages({
    "any.only": "Role must be either teacher or student",
    "string.empty": "Role is required",
    "any.required": "Role is required",
  }),

  teacherEmail: Joi.string()
    .email()
    .when("role", {
      is: "student",
      then: Joi.required().messages({
        "string.email": "Invalid teacher email format",
        "string.empty": "Teacher email is required for students",
        "any.required": "Teacher email is required for students",
      }),
      otherwise: Joi.optional().allow("", null),
    }),
});

const validateUserData = async (data) => {
  try {
    const validatedData = await userSchema.validateAsync(data, {
      abortEarly: false,
      stripUnknown: true,
    });
    return validatedData;
  } catch (error) {
    console.error("Validation error for row:", data);
    console.error("Error details:", error.details);
    return null;
  }
};

module.exports = { validateUserData };
