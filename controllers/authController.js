const bcrypt = require("bcryptjs");
const { User } = require("../models");
const { generateToken } = require("../config/auth");

exports.register = async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    const token = generateToken(user);
    res.status(201).json({ user, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new Error("Invalid login credentials");
    }
    const token = generateToken(user);
    res.json({ user, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
