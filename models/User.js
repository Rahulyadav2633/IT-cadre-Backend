const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const AddressSchema = new mongoose.Schema(
  {
    house: String,
    street: String,
    landmark: String,
    locality: String,
    city: String,
    district: String,
    state: String,
    pin: String,
  },
  { _id: false },
);

const EducationSchema = new mongoose.Schema({
  qualificationLevel: { type: String, required: true },
  degree: { type: String, required: true },
  subjectSpecialization: String,
  universityCollege: String,
  fromDate: Date,
  toDate: Date,
  resultDate: Date,
  divisionClass: String,
  resultType: String,
  score: String,
});

const ExperienceSchema = new mongoose.Schema({
  postHeld: { type: String, required: true },
  fieldOfExperience: String,
  fromDate: Date,
  toDate: Date,
  placeOfPosting: String,
  organisationName: String,
  addressOfOrganisation: String,
  technicalSkills: String,
  experienceCertificate: String,
});

const TransferSchema = new mongoose.Schema({
  postHeld: String,
  departmentName: String,
  joiningDate: Date,
  relievingDate: Date,
  noTransferTillDate: { type: Boolean, default: false },
  previousDepartment: String,
  currentDepartment: String,
  orderNo: String,
  orderDate: Date,
  orderUpload: String,
  addressOfOrganisation: String,
  remarks: String,
  addedByAdmin: { type: Boolean, default: false },
  addedAt: { type: Date, default: Date.now },
});

const TrainingSchema = new mongoose.Schema({
  trainingName: { type: String, required: true },
  instituteOrganisation: String,
  trainingType: String,
  durationDays: Number,
  trainingFrom: Date,
  trainingTo: Date,
  trainingCertificate: String,
  remarks: String,
  noTrainingTillDate: { type: Boolean, default: false },
});

const AppointmentSchema = new mongoose.Schema(
  {
    department: String,
    officeName: String,
    // ── post replaces old designation field ──
    post: String, // ← renamed from postDesignation
    additionalPost: String, // ← NEW
    appointmentType: String,
    appointmentOrderNo: String,
    appointmentOrderDate: Date,
    dateOfJoining: Date,
    reportingOfficerName: String,
    payLevel: String,
    employmentStatus: String,
  },
  { _id: false },
);

const NotificationSchema = new mongoose.Schema({
  from: {
    type: String,
    enum: ["so_admin", "ds_admin", "system"],
    default: "system",
  },
  fromName: String,
  type: {
    type: String,
    enum: ["revert", "reject", "approve", "hold", "info"],
    default: "info",
  },
  message: String,
  isRead: { type: Boolean, default: false },
  isDismissed: { type: Boolean, default: false }, // ← NEW for dismiss button
  createdAt: { type: Date, default: Date.now },
});

const UserSchema = new mongoose.Schema({
  employeeCode: { type: String, unique: true, sparse: true },

  role: {
    type: String,
    enum: ["employee", "so_admin", "ds_admin", "super_admin"],
    default: "employee",
  },

  // Basic Details
  firstName: { type: String, required: true },
  middleName: String,
  lastName: String,
  fatherName: String,
  motherName: String,
  gender: String,
  dob: Date,
  maritalStatus: String,
  aadhaar: String,
  pan: String,
  email: { type: String, required: true, unique: true, lowercase: true },
  mobile: String,
  category: String,
  bloodGroup: String,
  disability: String,

  // Post fields (renamed from designation)
  post: String, // ← main post
  additionalPost: String, // ← NEW additional post
  designation: String, // ← kept for backward compat

  workingDepartment: String,
  salariedDepartment: String,
  workingDepartmentSince: Date,
  photograph: String,

  permanentAddress: AddressSchema,
  correspondenceAddress: AddressSchema,

  // Auth
  password: String,
  isEmailVerified: { type: Boolean, default: false },
  isRegistrationComplete: { type: Boolean, default: false },

  // Completion flags
  basicDetailsComplete: { type: Boolean, default: false },
  appointmentDetailsComplete: { type: Boolean, default: false },
  educationDetailsComplete: { type: Boolean, default: false },
  experienceDetailsComplete: { type: Boolean, default: false },
  transfersComplete: { type: Boolean, default: false },
  trainingComplete: { type: Boolean, default: false },

  // Sections
  appointment: AppointmentSchema,
  education: [EducationSchema],
  experience: [ExperienceSchema],
  transfers: [TransferSchema],
  training: [TrainingSchema],

  // ── 3-Tier Approval ──────────────────────────────────────────────────────
  soStatus: {
    type: String,
    enum: ["pending", "verified", "reverted", "rejected"],
    default: "pending",
  },
  soNote: String,
  soActionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  soActionAt: Date,

  dsStatus: {
    type: String,
    enum: ["pending", "approved", "rejected", "hold"],
    default: "pending",
  },
  dsNote: String,
  dsActionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  dsActionAt: Date,

  approvalStatus: {
    type: String,
    enum: [
      "pending",
      "so_verified",
      "approved",
      "rejected",
      "hold",
      "reverted",
    ],
    default: "pending",
  },
  approvalNote: String,

  editRequests: [
    {
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      requestedAt: { type: Date, default: Date.now },
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
    },
  ],

  notifications: [NotificationSchema],

  adminDetails: {
    name: String,
    department: String,
    designation: String,
    phone: String,
  },
  adminDetailsComplete: { type: Boolean, default: false },
  firstLoginComplete: { type: Boolean, default: false },
  linkedEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

UserSchema.pre("save", async function (next) {
  this.updatedAt = Date.now();
  // Sync post → designation for backward compat
  if (this.appointment?.post) this.post = this.appointment.post;
  if (this.appointment?.additionalPost)
    this.additionalPost = this.appointment.additionalPost;
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("User", UserSchema);


