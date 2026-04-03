const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const multer = require("multer");
const fs = require("fs");
const Category = require("../models/Category");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const upload = multer({ dest: "uploads/receipts/" });

// Route chat
router.post("/send", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const messages = [
      {
        role: "system",
        content: "Bạn là trợ lý tài chính thông minh, trả lời bằng tiếng Việt.",
      },
    ];

    // Thêm lịch sử hội thoại
    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({
          role: msg.role === "model" ? "assistant" : msg.role,
          content: msg.parts?.[0]?.text || msg.content || "",
        });
      }
    }

    // Thêm tin nhắn hiện tại
    messages.push({ role: "user", content: message });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("OpenAI API error:", error);
    res.status(500).json({ error: "Chatbot error" });
  }
});

router.post("/scan-receipt", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Image is required" });
    }

    // Đọc ảnh và chuyển sang base64
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    // Lấy danh sách danh mục từ DB
    const categories = await Category.find({});
    const categoryList = categories.map((c) => ({
      id: c._id.toString(),
      name: c.name,
    }));
    const categoryNames = categoryList
      .map((c) => `- "${c.name}" (id: ${c.id})`)
      .join("\n");

    // Gọi OpenAI GPT-4o với ảnh + danh mục
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Bạn là trợ lý phân tích hóa đơn. Hãy đọc hóa đơn trong ảnh và trả về JSON duy nhất, không có text khác, theo format:
        {
          "amount": <tổng tiền là số nguyên, không có dấu chấm phẩy>,
          "description": "<mô tả ngắn gọn nội dung hóa đơn>",
          "items": ["<item 1>", "<item 2>"],
          "category_id": "<id danh mục phù hợp nhất>",
          "category_name": "<tên danh mục phù hợp nhất>"
        }

        Danh sách danh mục có sẵn:
        ${categoryNames}

        Hãy chọn danh mục phù hợp nhất dựa vào nội dung hóa đơn. Nếu không chắc chắn, chọn danh mục gần nghĩa nhất.
        Nếu không đọc được hóa đơn, trả về: {"amount": 0, "description": "Không đọc được hóa đơn", "items": [], "category_id": "", "category_name": ""}`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
            {
              type: "text",
              text: "Hãy phân tích hóa đơn này và trả về JSON.",
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    // Xóa file tạm
    fs.unlinkSync(req.file.path);

    // Parse kết quả
    const raw = completion.choices[0].message.content;
    const cleaned = raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      result = {
        amount: 0,
        description: raw,
        items: [],
        category_id: "",
        category_name: "",
      };
    }

    res.json(result);
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Scan receipt error:", error);
    res.status(500).json({ error: "Scan receipt failed" });
  }
});

module.exports = router;
