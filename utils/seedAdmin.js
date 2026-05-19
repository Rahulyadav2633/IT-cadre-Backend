const User = require("../models/User");

module.exports = async function seedAdmin() {
  try {
    // ── Remove stale legacy admin account ─────────────────────────────────────
    await User.deleteOne({ email: "admin@company.com" });

    // ── Super Admin ───────────────────────────────────────────────────────────
    let superAdmin = await User.findOne({ role: "super_admin" });
    if (!superAdmin) {
      superAdmin = await User.create({
        firstName: "Super",
        lastName: "Admin",
        email: process.env.SUPER_ADMIN_EMAIL || "superadmin@company.com",
        mobile: process.env.SUPER_ADMIN_MOBILE || "9999999999",
        password: process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin@123",
        role: "super_admin",
        isEmailVerified: true,
        isRegistrationComplete: true,
        firstLoginComplete: true,
        adminDetailsComplete: true,
      });
      console.log("✅ Super Admin created:", superAdmin.email);
    } else {
      await User.updateOne(
        { role: "super_admin" },
        {
          adminDetailsComplete: true,
          firstLoginComplete: true,
          isRegistrationComplete: true,
        },
      );
      console.log("✅ Super Admin exists:", superAdmin.email);
    }

    // ── SO Admin ──────────────────────────────────────────────────────────────
    let soAdmin = await User.findOne({
      email: process.env.SO_ADMIN_EMAIL || "admin@company.com",
    });
    if (!soAdmin) soAdmin = await User.findOne({ role: "so_admin" });
    if (!soAdmin) {
      soAdmin = await User.create({
        firstName: "SO",
        lastName: "Admin",
        email: process.env.SO_ADMIN_EMAIL || "so@company.com",
        mobile: process.env.SO_ADMIN_MOBILE || "9999999998",
        password: process.env.SO_ADMIN_PASSWORD || "SAdmin123",
        role: "so_admin",
        isEmailVerified: true,
        isRegistrationComplete: true,
        firstLoginComplete: true,
        adminDetailsComplete: true,
      });
      console.log("✅ SO Admin created:", soAdmin.email);
    } else {
      await User.updateOne(
        { _id: soAdmin._id },
        {
          role: "so_admin",
          adminDetailsComplete: true,
          firstLoginComplete: true,
          isRegistrationComplete: true,
        },
      );
      console.log("✅ SO Admin exists:", soAdmin.email);
    }

    // ── DS Admin ──────────────────────────────────────────────────────────────
    let dsAdmin = await User.findOne({
      email: process.env.DS_ADMIN_EMAIL || "ds_admin@company.com",
    });
    if (!dsAdmin) dsAdmin = await User.findOne({ role: "ds_admin" });
    if (!dsAdmin) {
      dsAdmin = await User.create({
        firstName: "DS",
        lastName: "Admin",
        email: process.env.DS_ADMIN_EMAIL || "ds@company.com",
        mobile: process.env.DS_ADMIN_MOBILE || "9999999997",
        password: process.env.DS_ADMIN_PASSWORD || "DSAdmin123",
        role: "ds_admin",
        isEmailVerified: true,
        isRegistrationComplete: true,
        firstLoginComplete: true,
        adminDetailsComplete: true,
      });
      console.log("✅ DS Admin created:", dsAdmin.email);
    } else {
      await User.updateOne(
        { _id: dsAdmin._id },
        {
          role: "ds_admin",
          adminDetailsComplete: true,
          firstLoginComplete: true,
          isRegistrationComplete: true,
        },
      );
      console.log("✅ DS Admin exists:", dsAdmin.email);
    }

    // ── Migrate old 'admin' role ───────────────────────────────────────────────
    const migrated = await User.updateMany(
      { role: "admin" },
      {
        role: "so_admin",
        adminDetailsComplete: true,
        firstLoginComplete: true,
      },
    );
    if (migrated.modifiedCount > 0)
      console.log(
        `✅ Migrated ${migrated.modifiedCount} old admin(s) to so_admin`,
      );
  } catch (err) {
    console.error("❌ Seed error:", err.message);
  }
};
