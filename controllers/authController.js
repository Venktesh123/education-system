const bcrypt = require("bcryptjs");
const User = require("../models/User"); // Note: Changed from Course to User model
const { generateToken } = require("../config/auth");

// Helper function to validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

exports.register = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    // Validate required fields
    if (!email || !password || !name || !role) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["email", "password", "name", "role"],
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: "Invalid email format",
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        error: "Email already registered",
        message: "Please use a different email address or try logging in",
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        error: "Password too weak",
        message: "Password must be at least 6 characters long",
      });
    }

    // Validate role
    if (!["teacher", "student"].includes(role)) {
      return res.status(400).json({
        error: "Invalid role",
        message: "Role must be either 'teacher' or 'student'",
      });
    }

    // Create new user
    const user = new User({
      email,
      password,
      name,
      role,
    });

    await user.save();

    // Generate token
    const token = generateToken(user);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: "Registration successful",
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      error: "Registration failed",
      message: error.message,
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: "Missing credentials",
        required: ["email", "password"],
      });
    }

    // Find user by email
    const user = await User.findOne({ email }).select("+password");

    // Check if user exists and password is correct
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        error: "Invalid credentials",
        message: "Email or password is incorrect",
      });
    }

    // Generate token
    const token = generateToken(user);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      message: "Login successful",
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Login failed",
      message: error.message,
    });
  }
};

// Password reset request
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Email is required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        error: "User not found",
        message: "No account found with this email",
      });
    }

    // Here you would typically:
    // 1. Generate a password reset token
    // 2. Save it to the user document with an expiry
    // 3. Send an email with reset instructions
    // For this example, we'll just acknowledge the request

    res.json({
      message: "Password reset instructions sent",
      info: "Please check your email for further instructions",
    });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({
      error: "Password reset request failed",
      message: error.message,
    });
  }
};
