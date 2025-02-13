const Joi = require("joi");

const userSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid("teacher", "student").required(),
});

const validateUserData = async (data) => {
  try {
    return await userSchema.validateAsync(data);
  } catch (error) {
    console.error("Validation error:", error.message);
    return null;
  }
};

module.exports = { validateUserData };
