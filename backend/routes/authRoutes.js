
import express from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import User from "../models/User.js";

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}

router.post("/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        error: "Name, email, and password are required.",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 80) {
      return res.status(400).json({
        error: "Name must be between 2 and 80 characters.",
      });
    }

    if (
      cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      return res.status(400).json({
        error: "Enter a valid email address.",
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        error: "Password must be between 8 and 128 characters.",
      });
    }

    const existingUser = await User.findOne({ email: cleanEmail });

    if (existingUser) {
      return res.status(409).json({
        error: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash,
    });

    // Start a fresh session after account creation, just as we do after login.
    req.session.regenerate((sessionError) => {
      if (sessionError) {
        console.error("Registration session regeneration error:", sessionError);
        return res.status(500).json({
          error: "Account created, but could not start your session. Please log in.",
        });
      }

      req.session.userId = user._id.toString();

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Registration session save error:", saveError);
          return res.status(500).json({
            error: "Account created, but could not save your session. Please log in.",
          });
        }

        return res.status(201).json({
          message: "Account created successfully.",
          user: publicUser(user),
        });
      });
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        error: "An account with this email already exists.",
      });
    }

    console.error("Registration error:", error);
    return res.status(500).json({
      error: "Registration failed. Please try again.",
    });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: "Email and password are required.",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash");

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    // Prevent session fixation by regenerating the session on login.
    req.session.regenerate((error) => {
      if (error) {
        console.error("Session regeneration error:", error);
        return res.status(500).json({
          error: "Could not start your session. Please try again.",
        });
      }

      req.session.userId = user._id.toString();

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Session save error:", saveError);
          return res.status(500).json({
            error: "Could not save your session. Please try again.",
          });
        }

        return res.json({
          message: "Login successful.",
          user: publicUser(user),
        });
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      error: "Login failed. Please try again.",
    });
  }
});

router.get("/me", async (req, res) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Not logged in." });
    }

    const user = await User.findById(req.session.userId);

    if (!user) {
      return req.session.destroy(() => {
        res.clearCookie("vocaread.sid");
        return res.status(401).json({ error: "Session is no longer valid." });
      });
    }

    return res.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Session check error:", error);
    return res.status(500).json({
      error: "Could not verify your session.",
    });
  }
});

router.post("/logout", (req, res) => {
  if (!req.session) {
    res.clearCookie("vocaread.sid");
    return res.json({ message: "Logged out." });
  }

  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error);
      return res.status(500).json({
        error: "Could not log out. Please try again.",
      });
    }

    res.clearCookie("vocaread.sid");
    return res.json({ message: "Logged out successfully." });
  });
});

export default router;
