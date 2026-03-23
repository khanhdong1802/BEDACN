const Message = require("./models/Message");
const User = require("./models/User");

module.exports = function initSocket(io) {
  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id);

    socket.on("joinGroup", (groupId) => {
      socket.join(groupId);
    });

    socket.on("sendMessage", async (data) => {
      try {
        console.log("📩 sendMessage received:", data);

        const message = await Message.create({
          groupId: data.groupId,
          senderId: data.senderId,
          content: data.content,
          type: data.type || "text",
        });

        // 🔥 LẤY THÔNG TIN USER
        const user = await User.findById(data.senderId).select("name avatar");

        // 🔥 EMIT CHUẨN CHO FLUTTER
        io.to(data.groupId).emit("newMessage", {
          ...message._doc,
          senderId: {
            _id: user._id,
            name: user.name,
            avatar: user.avatar,
          },
        });

        console.log("✅ Message emitted with sender info");
      } catch (err) {
        console.error("❌ sendMessage error:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log("🔴 Socket disconnected:", socket.id);
    });
  });
};
