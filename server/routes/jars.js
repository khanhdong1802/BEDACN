// routes/jars.js
const router = require("express").Router();
const mongoose = require("mongoose");
const JarTemplate = require("../models/JarTemplate");
const JarCycle = require("../models/JarCycle");
const JarExpense = require("../models/JarExpense");
const Income = require("../models/Income");
const Expense = require("../models/Expense");

// helper monthKey
const getMonthKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

// ====== ALLOCATION SYNC (source of truth = JarTemplate.monthlyLimit) ======
async function ensureAllocation(cycle, userId, { force = false } = {}) {
  const templates = await JarTemplate.find({ user_id: userId, isActive: true }).lean();
  if (!templates.length) throw new Error("NO_ACTIVE_TEMPLATES");

  const current = new Map(
    (Array.isArray(cycle.buckets) ? cycle.buckets : []).map((b) => [String(b.template_id), b])
  );

  const nextBuckets = templates.map((t) => {
    const old = current.get(String(t._id));
    const limitFromTemplate = Number(t.monthlyLimit || 0);

    // force=true => lấy đúng theo template
    // force=false => giữ limit đang có trong cycle (nếu đã tồn tại), để tránh “nhảy” số
    const monthlyLimit =
      force ? limitFromTemplate : (typeof old?.monthlyLimit === "number" ? old.monthlyLimit : limitFromTemplate);

    return {
      template_id: t._id,
      name: t.name,
      icon: t.icon,
      color: t.color,
      monthlyLimit,
    };
  });

  cycle.buckets = nextBuckets;
  await cycle.save();
  return cycle;
}




// routes/jars.js
router.get("/cycle/current", async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1..12
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;

    // Tính ngày đầu và cuối tháng
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // ngày cuối tháng

    // ✅ tìm cycle tháng hiện tại
    let cycle = await JarCycle.findOne({ user_id: userId, monthKey });

    // ✅ nếu chưa có -> tạo mới
    if (!cycle) {
      cycle = await JarCycle.create({
        user_id: userId,
        monthKey,
        startDate,
        endDate,
        fundedAmount: 0,
        totalIn: 0,
        totalOut: 0,
      });
    }

    return res.json({ success: true, cycle });
  } catch (err) {
    console.error("❌ cycle/current error:", err);
    return res.status(500).json({ success: false, message: "Lỗi lấy/tạo chu kỳ tháng hiện tại" });
  }
});

router.post("/cycle/:cycleId/fund", async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const fund = Number(req.body.amount || 0);
    if (fund <= 0) return res.status(400).json({ success: false, message: "Số tiền nạp không hợp lệ." });

    // 1) check số dư cá nhân
    const [incAgg] = await Income.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const [expAgg] = await Expense.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const balance = (incAgg?.total || 0) - (expAgg?.total || 0);

    if (fund > balance) {
      return res.status(400).json({ success: false, message: "Số dư cá nhân không đủ để nạp vào hũ." });
    }

    // 2) cộng dồn fundedAmount (KHÔNG set)
    const cycle = await JarCycle.findOneAndUpdate(
      { _id: req.params.cycleId, user_id: userId },
      { $inc: { fundedAmount: fund }, $set: { fundedAt: new Date() } },
      { new: true }
    );
    if (!cycle) return res.status(404).json({ success: false, message: "Không tìm thấy chu kỳ." });

    // 3) trừ số dư cá nhân bằng Income âm
    await Income.create({
      user_id: userId,
      amount: -fund,
      source: "jar_funding",
      received_date: new Date(),
      note: `Nạp vào hũ tháng ${cycle.monthKey}`,
      status: "pending",
    });

    // 4) (optional) sync buckets theo templates cho chắc
    try {
      await ensureAllocation(cycle, userId, { force: false });
    } catch (e) {
      // nếu chưa có template nào thì bỏ qua
    }

    return res.json({ success: true, data: cycle });
  } catch (err) {
    console.error("fund error:", err);
    return res.status(500).json({ success: false, message: "Lỗi nạp tiền vào hũ." });
  }
});

// ===============================
// POST /api/jars/templates
// ===============================
router.post("/templates", async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { name, icon, color, monthlyLimit } = req.body;
    const limit = Number(monthlyLimit || 0);
    if (!name) return res.status(400).json({ success: false, message: "Thiếu tên mục." });
    if (limit <= 0) return res.status(400).json({ success: false, message: "Hạn mức tháng phải > 0." });

    // lấy cycle tháng hiện tại
    const monthKey = getMonthKey(new Date());
    const cycle = await JarCycle.findOne({ user_id: userId, monthKey });
    const fundedAmount = Number(cycle?.fundedAmount || 0);

    if (fundedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Bạn cần nạp tiền vào hũ trước khi tạo mục chi tiêu.",
      });
    }

    // tính tổng hạn mức đã tạo
    const templates = await JarTemplate.find({ user_id: userId, isActive: true }).lean();
    const totalCurrentLimit = templates.reduce((sum, t) => sum + Number(t.monthlyLimit || 0), 0);

    if (totalCurrentLimit + limit > fundedAmount) {
      return res.status(400).json({
        success: false,
        message: `Không đủ ngân sách để tạo mục mới. Còn lại: ${(fundedAmount - totalCurrentLimit).toLocaleString("vi-VN")}đ`,
      });
    }

    const created = await JarTemplate.create({
      user_id: userId,
      name,
      icon,
      color,
      monthlyLimit: limit,
      isActive: true,
      // allocateType/allocateValue nếu bạn muốn giữ thì để, còn không thì bỏ
    });

    // sync buckets để mục mới xuất hiện ngay
    if (cycle) await ensureAllocation(cycle, userId, { force: false });

    return res.json({ success: true, data: created });
  } catch (err) {
    console.error("create template error:", err);
    return res.status(500).json({ success: false, message: "Lỗi tạo mục chi tiêu." });
  }
});



// GET /api/jars/templates
router.get("/templates", async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: missing user" });

    const templates = await JarTemplate.find({ user_id: userId }).lean();
    res.json({ success: true, templates });
  } catch (e) {
    console.error('Error fetching templates:', e);
    res.status(500).json({ success: false, message: 'Lỗi lấy templates.' });
  }
});

// DELETE /api/jars/templates/:id
router.delete("/templates/:id", async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid template id" });

    // kiểm tra ownership
    const tpl = await JarTemplate.findOne({ _id: id, user_id: userId });
    if (!tpl)
      return res.status(404).json({ success: false, message: "Template not found" });

    // ❗ kiểm tra đã có chi tiêu chưa (RẤT NÊN)
    const used = await JarExpense.exists({ template_id: id });
    if (used) {
      return res.status(400).json({
        success: false,
        message: "Không thể xóa mục đã có phát sinh chi tiêu",
      });
    }

    // xóa template
    await JarTemplate.deleteOne({ _id: id });

    // xóa bucket khỏi các cycle
    await JarCycle.updateMany(
      { "buckets.template_id": new mongoose.Types.ObjectId(id) },
      { $pull: { buckets: { template_id: new mongoose.Types.ObjectId(id) } } }
    );

    res.json({ success: true, message: "Đã xóa mục chi tiêu" });
  } catch (e) {
    console.error("Error deleting template:", e);
    res.status(500).json({ success: false, message: "Lỗi xóa template." });
  }
});


router.post("/cycle/:cycleId/apply-allocation", async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const force = !!req.body?.force; // nếu muốn ép lấy lại limit theo template thì gửi {force:true}

    let cycle = await JarCycle.findOne({ _id: req.params.cycleId, user_id: userId });
    if (!cycle) return res.status(404).json({ success: false, message: "Không tìm thấy chu kỳ." });

    cycle = await ensureAllocation(cycle, userId, { force });

    return res.json({ success: true, data: cycle });
  } catch (err) {
    console.error("apply allocation error:", err);
    return res.status(500).json({ success: false, message: "Lỗi phân bổ." });
  }
});

router.patch("/templates/:id", async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const newLimit = Number(req.body.monthlyLimit || 0);
    if (newLimit <= 0) return res.status(400).json({ success: false, message: "Hạn mức tháng phải > 0." });

    const monthKey = getMonthKey(new Date());
    const cycle = await JarCycle.findOne({ user_id: userId, monthKey });
    const fundedAmount = Number(cycle?.fundedAmount || 0);
    if (fundedAmount <= 0) return res.status(400).json({ success: false, message: "Bạn chưa nạp tiền vào hũ." });

    const templates = await JarTemplate.find({ user_id: userId, isActive: true }).lean();
    const otherTotal = templates
      .filter((t) => String(t._id) !== String(req.params.id))
      .reduce((sum, t) => sum + Number(t.monthlyLimit || 0), 0);

    if (otherTotal + newLimit > fundedAmount) {
      return res.status(400).json({
        success: false,
        message: `Không đủ ngân sách. Còn lại: ${(fundedAmount - otherTotal).toLocaleString("vi-VN")}đ`,
      });
    }

    const updated = await JarTemplate.findOneAndUpdate(
      { _id: req.params.id, user_id: userId },
      { $set: { monthlyLimit: newLimit } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Không tìm thấy mục." });

    // update bucket trong cycle hiện tại cho khớp
    if (cycle) {
      cycle.buckets = (cycle.buckets || []).map((b) =>
        String(b.template_id) === String(updated._id) ? { ...b, monthlyLimit: newLimit } : b
      );
      await cycle.save();
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("update template limit error:", err);
    return res.status(500).json({ success: false, message: "Lỗi cập nhật hạn mức." });
  }
});



router.post("/cycle/:cycleId/expense", async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { templateId, amount, note, spentAt } = req.body;
    const money = Number(amount || 0);
    if (money <= 0)
      return res.status(400).json({ success: false, message: "Số tiền không hợp lệ." });

    let cycle = await JarCycle.findOne({
      _id: req.params.cycleId,
      user_id: userId,
    });
    if (!cycle)
      return res.status(404).json({ success: false, message: "Không tìm thấy chu kỳ." });

    // ✅ AUTO APPLY
    cycle = await ensureAllocation(cycle, userId);

    const bucket = cycle.buckets.find(
      (b) => String(b.template_id) === String(templateId)
    );
    if (!bucket)
      return res.status(400).json({ success: false, message: "Mục chi tiêu không hợp lệ." });

    const [spentAgg] = await JarExpense.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          cycle_id: new mongoose.Types.ObjectId(cycle._id),
          template_id: new mongoose.Types.ObjectId(templateId),
        },
      },
      { $group: { _id: null, spent: { $sum: "$amount" } } },
    ]);

    const spentBefore = spentAgg?.spent || 0;
    const monthlyLimit = bucket.monthlyLimit || 0;

    const start = new Date(cycle.monthKey + "-01T00:00:00");
    const now = new Date();
    const daysInMonth = new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      0
    ).getDate();
    const dayToday =
      now.getMonth() === start.getMonth() &&
      now.getFullYear() === start.getFullYear()
        ? now.getDate()
        : 1;
    const daysLeft = Math.max(1, daysInMonth - (dayToday - 1));

    const suggestPerDay =
      monthlyLimit > 0
        ? Math.round((monthlyLimit - spentBefore) / daysLeft)
        : 0;

    const template = await JarTemplate.findById(templateId).lean();
    const warningPercent = template?.warningPercent || 120;
    const allowOver = template?.allowOver !== false;

    const warningThreshold = Math.round(
      suggestPerDay * (warningPercent / 100)
    );

    if (!allowOver && money > warningThreshold) {
      return res.status(400).json({
        success: false,
        message: "Chi vượt giới hạn cho phép của mục này.",
      });
    }

    const doc = await JarExpense.create({
      user_id: userId,
      cycle_id: cycle._id,
      template_id: templateId,
      amount: money,
      note: note || "",
      spentAt: spentAt ? new Date(spentAt) : new Date(),
    });

    res.status(201).json({ success: true, expense: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Lỗi ghi chi tiêu." });
  }
});

router.get("/cycle/:cycleId/overview", async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: missing user" });
    const cycle = await JarCycle.findOne({ _id: req.params.cycleId, user_id: userId }).lean();
    if (!cycle) return res.status(404).json({ success: false, message: "Không tìm thấy chu kỳ." });

    const start = new Date(cycle.monthKey + "-01T00:00:00");
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    const now = new Date();
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const dayToday = now.getMonth() === start.getMonth() && now.getFullYear() === start.getFullYear()
      ? now.getDate()
      : 1;
    const daysLeft = Math.max(1, daysInMonth - (dayToday - 1)); // còn bao nhiêu ngày tính cả hôm nay

    // aggregate spent per template in this cycle
    const spentAgg = await JarExpense.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(userId), cycle_id: new mongoose.Types.ObjectId(cycle._id) } },
      { $group: { _id: "$template_id", spent: { $sum: "$amount" } } },
    ]);

    const spentMap = new Map(spentAgg.map((x) => [String(x._id), x.spent]));
    const buckets = cycle.buckets.map((b) => {
      const spent = spentMap.get(String(b.template_id)) || 0;
      const limit = b.monthlyLimit || 0;
      const remaining = Math.max(0, limit - spent);

      // gợi ý chi hôm nay
      const suggest = limit > 0 ? Math.round(remaining / daysLeft) : 0;

      return {
        ...b,
        spent,
        remaining,
        daysLeft,
        suggestPerDay: suggest,
      };
    });

    const spentTotal = buckets.reduce((s, b) => s + (b.spent || 0), 0);

    res.json({
      success: true,
      cycle: {
        _id: cycle._id,
        monthKey: cycle.monthKey,
        fundedAmount: cycle.fundedAmount,
        spentTotal,
        daysLeft,
        buckets,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Lỗi overview hũ." });
  }
});

router.post("/cycle/:cycleId/check-limit", async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { templateId, amountToday } = req.body;
    const amount = Number(amountToday);

    // ===== VALIDATE INPUT =====
    if (!templateId || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Dữ liệu không hợp lệ",
      });
    }

    // ===== LOAD CYCLE (KHÔNG LEAN) =====
    let cycle = await JarCycle.findOne({
      _id: req.params.cycleId,
      user_id: userId,
    });

    if (!cycle) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy chu kỳ",
      });
    }

    // ===== ENSURE ALLOCATION (FAIL-FAST) =====
    try {
      cycle = await ensureAllocation(cycle, userId);
    } catch (e) {
      if (e.message === "NO_ACTIVE_TEMPLATES") {
        return res.status(400).json({
          success: false,
          message: "Bạn chưa có mục chi tiêu nào đang bật.",
        });
      }
      throw e;
    }

    // ===== TÌM BUCKET (CÓ FALLBACK TỰ HEAL STATE) =====
    let bucket = cycle.buckets.find(
      (b) => String(b.template_id) === String(templateId)
    );

    // 🔥 FIX QUAN TRỌNG: fallback khi FE–DB lệch state
    if (!bucket) {
      cycle.buckets = [];
      cycle = await ensureAllocation(cycle, userId);

      bucket = cycle.buckets.find(
        (b) => String(b.template_id) === String(templateId)
      );
    }

    if (!bucket) {
      return res.status(400).json({
        success: false,
        message: "Mục chi tiêu chưa được phân bổ cho chu kỳ này.",
      });
    }

    // ===== TÍNH NGÀY =====
    const start = new Date(`${cycle.monthKey}-01T00:00:00`);
    const now = new Date();

    const daysInMonth = new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      0
    ).getDate();

    const dayToday =
      now.getMonth() === start.getMonth() &&
      now.getFullYear() === start.getFullYear()
        ? now.getDate()
        : 1;

    const daysLeft = Math.max(1, daysInMonth - (dayToday - 1));

    // ===== TỔNG ĐÃ CHI =====
    const [spentAgg] = await JarExpense.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          cycle_id: new mongoose.Types.ObjectId(cycle._id),
          template_id: new mongoose.Types.ObjectId(templateId),
        },
      },
      {
        $group: {
          _id: null,
          spent: { $sum: "$amount" },
        },
      },
    ]);

    const spent = spentAgg?.spent || 0;
    const limit = Number(bucket.monthlyLimit || 0);
    const remaining = Math.max(0, limit - spent);

    const suggestPerDay =
      limit > 0 ? Math.round(remaining / daysLeft) : 0;

    // ===== ĐÁNH GIÁ MỨC =====
    let level = "safe";
    if (amount > suggestPerDay * 1.2) level = "danger";
    else if (amount > suggestPerDay) level = "warning";

    return res.json({
      success: true,
      meta: {
        spent,
        limit,
        remaining,
        daysLeft,
        suggestPerDay,
        level,
        thresholds: {
          safeMax: suggestPerDay,
          warningMax: Math.round(suggestPerDay * 1.2),
        },
      },
    });
  } catch (e) {
    console.error("❌ check-limit error:", e);
    return res.status(500).json({
      success: false,
      message: "Lỗi check hạn mức",
    });
  }
});


module.exports = router;
