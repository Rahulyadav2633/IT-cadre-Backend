const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const AddressSchema = new mongoose.Schema(
  {
    house: { type: String, trim: true },
    street: { type: String, trim: true },
    landmark: { type: String, trim: true },
    locality: { type: String, trim: true },
    city: { type: String, trim: true },
    district: { type: String, trim: true },
    state: { type: String, trim: true },
    pin: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^\d{6}$/.test(v);
        },
        message: "PIN code must be a 6-digit number",
      },
    },
  },
  { _id: false },
);

const EducationSchema = new mongoose.Schema({
  qualificationLevel: {
    type: String,
    required: [true, "Qualification level is required"],
    trim: true,
  },
  degree: {
    type: String,
    required: [true, "Degree / Course name is required"],
    trim: true,
  },
  subjectSpecialization: { type: String, trim: true },
  universityCollege: { type: String, trim: true },
  fromDate: { type: Date },
  toDate: { type: Date },
  resultDate: { type: Date },
  divisionClass: { type: String, trim: true },
  resultType: { type: String, trim: true },
  score: { type: String, trim: true },
});

const ExperienceSchema = new mongoose.Schema({
  postHeld: {
    type: String,
    required: [true, "Post held is required"],
    trim: true,
  },
  fieldOfExperience: { type: String, trim: true },
  fromDate: { type: Date },
  toDate: { type: Date },
  placeOfPosting: { type: String, trim: true },
  organisationName: { type: String, trim: true },
  addressOfOrganisation: { type: String, trim: true },
  technicalSkills: { type: String, trim: true },
  experienceCertificate: { type: String, trim: true },
});

const TransferSchema = new mongoose.Schema({
  postHeld: { type: String, trim: true },
  departmentName: { type: String, trim: true },
  joiningDate: { type: Date },
  relievingDate: { type: Date },
  noTransferTillDate: { type: Boolean, default: false },
  previousDepartment: { type: String, trim: true },
  currentDepartment: { type: String, trim: true },
  orderNo: { type: String, trim: true },
  orderDate: { type: Date },
  orderUpload: { type: String, trim: true },
  addressOfOrganisation: { type: String, trim: true },
  remarks: { type: String, trim: true },
  addedByAdmin: { type: Boolean, default: false },
  addedAt: { type: Date, default: Date.now },
});

const TrainingSchema = new mongoose.Schema({
  trainingName: {
    type: String,
    required: [true, "Training name is required"],
    trim: true,
  },
  instituteOrganisation: { type: String, trim: true },
  trainingType: { type: String, trim: true },
  durationDays: {
    type: Number,
    min: [0, "Duration cannot be negative"],
  },
  trainingFrom: { type: Date },
  trainingTo: { type: Date },
  trainingCertificate: { type: String, trim: true },
  remarks: { type: String, trim: true },
  noTrainingTillDate: { type: Boolean, default: false },
});

const AppointmentSchema = new mongoose.Schema(
  {
    department: { type: String, trim: true },
    officeName: { type: String, trim: true },
    post: { type: String, trim: true },
    additionalPost: { type: String, trim: true },
    appointmentType: { type: String, trim: true },
    appointmentOrderNo: { type: String, trim: true },
    appointmentOrderDate: { type: Date },
    dateOfJoining: { type: Date },
    reportingOfficerName: { type: String, trim: true },
    payLevel: { type: String, trim: true },
    employmentStatus: { type: String, trim: true },
  },
  { _id: false },
);

const NotificationSchema = new mongoose.Schema({
  from: {
    type: String,
    enum: {
      values: ["so_admin", "ds_admin", "super_admin", "system"],
      message: "Invalid notification sender: {VALUE}",
    },
    default: "system",
  },
  fromName: { type: String, trim: true },
  type: {
    type: String,
    enum: {
      values: ["revert", "reject", "approve", "hold", "info", "warning", "success"],
      message: "Invalid notification type: {VALUE}",
    },
    default: "info",
  },
  message: { type: String, required: [true, "Notification message is required"] },
  isRead: { type: Boolean, default: false },
  isDismissed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const UserSchema = new mongoose.Schema({
  employeeCode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    uppercase: true,
    validate: {
      validator: function (v) {
        // Only validate when a value is actually provided
        if (!v) return true;
        return /^[A-Z0-9]{1,6}$/.test(v);
      },
      message:
        "Employee code must be up to 6 alphanumeric characters (A–Z, 0–9)",
    },
  },

  role: {
    type: String,
    enum: {
      values: ["employee", "so_admin", "ds_admin", "super_admin"],
      message: "Invalid role: {VALUE}",
    },
    default: "employee",
  },

  // ── Basic Details ──────────────────────────────────────────────────────────
  firstName: {
    type: String,
    required: [true, "First name is required"],
    trim: true,
  },
  middleName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  gender: {
    type: String,
    trim: true,
    enum: {
      values: ["Male", "Female", "Other", "male", "female", "other", ""],
      message: "Invalid gender value",
    },
  },
  dob: {
    type: Date,
    validate: {
      validator: function (v) {
        return !v || v < new Date();
      },
      message: "Date of birth must be in the past",
    },
  },
  maritalStatus: { type: String, trim: true },
  aadhaar: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        return !v || /^\d{12}$/.test(v);
      },
      message: "Aadhaar number must be exactly 12 digits",
    },
  },
  pan: {
    type: String,
    trim: true,
    uppercase: true,
    validate: {
      validator: function (v) {
        return !v || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v);
      },
      message: "Invalid PAN format (e.g. ABCDE1234F)",
    },
  },
  email: {
    type: String,
    required: [true, "Email address is required"],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: "Please enter a valid email address",
    },
  },
  mobile: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        return !v || /^[6-9]\d{9}$/.test(v);
      },
      message: "Mobile must be a valid 10-digit phone number",
    },
  },
  category: { type: String, trim: true },
  bloodGroup: { type: String, trim: true },
  disability: { type: String, trim: true },

  // ── Post fields ────────────────────────────────────────────────────────────
  post: { type: String, trim: true },
  additionalPost: { type: String, trim: true },
  designation: { type: String, trim: true },

  workingDepartment: { type: String, trim: true },
  salariedDepartment: { type: String, trim: true },
  workingDepartmentSince: { type: Date },
  photograph: { type: String, trim: true },

  permanentAddress: AddressSchema,
  correspondenceAddress: AddressSchema,

  // ── Auth ───────────────────────────────────────────────────────────────────
  password: { type: String },
  isEmailVerified: { type: Boolean, default: false },
  isRegistrationComplete: { type: Boolean, default: false },

  // ── Completion Flags ───────────────────────────────────────────────────────
  basicDetailsComplete: { type: Boolean, default: false },
  appointmentDetailsComplete: { type: Boolean, default: false },
  educationDetailsComplete: { type: Boolean, default: false },
  experienceDetailsComplete: { type: Boolean, default: false },
  transfersComplete: { type: Boolean, default: false },
  trainingComplete: { type: Boolean, default: false },

  // ── Subdocuments ───────────────────────────────────────────────────────────
  appointment: AppointmentSchema,
  education: [EducationSchema],
  experience: [ExperienceSchema],
  transfers: [TransferSchema],
  training: [TrainingSchema],

  // ── Approval Workflow ──────────────────────────────────────────────────────
  soStatus: {
    type: String,
    enum: {
      values: ["pending", "verified", "reverted", "rejected"],
      message: "Invalid SO status: {VALUE}",
    },
    default: "pending",
  },
  soNote: { type: String, trim: true },
  soActionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  soActionAt: { type: Date },

  dsStatus: {
    type: String,
    enum: {
      values: ["pending", "approved", "rejected", "hold"],
      message: "Invalid DS status: {VALUE}",
    },
    default: "pending",
  },
  dsNote: { type: String, trim: true },
  dsActionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  dsActionAt: { type: Date },

  approvalStatus: {
    type: String,
    enum: {
      values: [
        "pending",
        "so_verified",
        "approved",
        "rejected",
        "hold",
        "reverted",
      ],
      message: "Invalid approval status: {VALUE}",
    },
    default: "pending",
  },
  approvalNote: { type: String, trim: true },

  editRequests: [
    {
      field: { type: String, trim: true },
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
    name: { type: String, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    phone: { type: String, trim: true },
  },
  adminDetailsComplete: { type: Boolean, default: false },
  firstLoginComplete: { type: Boolean, default: false },
  linkedEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

UserSchema.pre("save", async function (next) {
  this.updatedAt = Date.now();
  // Sync post -> designation for backward compatibility
  if (this.appointment?.post) this.post = this.appointment.post;
  if (this.appointment?.additionalPost)
    this.additionalPost = this.appointment.additionalPost;

  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.comparePassword = async function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("User", UserSchema);
