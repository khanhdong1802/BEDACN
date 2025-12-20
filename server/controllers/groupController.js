const express = require("express");
const router = express.Router();
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");

// Controller class for group management
class GroupController {
  // Method to create a new group
  async createGroup(req, res) {
    const { name, description, created_by } = req.body;

    if (!name || !created_by) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    try {
      const newGroup = await Group.create({ name, description, created_by });
      res.status(201).json(newGroup);
    } catch (err) {
      console.error("Error creating group:", err);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Method to get all groups for a user
  async getUserGroups(req, res) {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }

    try {
      const groupMembers = await GroupMember.find({ user_id: userId });
      const groupIds = groupMembers.map((gm) => gm.group_id);
      const groups = await Group.find({ _id: { $in: groupIds } });
      res.json({ groups });
    } catch (err) {
      console.error("Error fetching user groups:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
}

module.exports = new GroupController();
