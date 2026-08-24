export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  uploadDir: process.env.UPLOAD_DIR || './data/uploads',
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '100', 10),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@karema.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin1234',
  adminName: process.env.ADMIN_NAME || 'Administrator',
  isProd: process.env.NODE_ENV === 'production',
};
