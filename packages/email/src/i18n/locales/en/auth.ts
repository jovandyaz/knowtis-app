export const auth = {
  verifyEmail: {
    subject: 'Verify your email — Knowtis',
    title: 'Verify your email',
    preview: 'Your verification code is {{code}}',
    greeting: 'Hi {{name}},',
    instruction:
      'Thanks for signing up for Knowtis! Enter this code to verify your email address.',
    codeIntro: 'Verification code',
    codeExpiry: 'This code expires in 15 minutes.',
    buttonText: 'Verify email',
    disclaimer:
      "If you didn't create an account, you can safely ignore this email.",
    expiry: 'This link expires in 24 hours.',
  },
  resetPassword: {
    subject: 'Reset your password — Knowtis',
    title: 'Reset your password',
    preview: 'Reset your Knowtis password',
    greeting: 'Hi {{name}},',
    instruction:
      'We received a request to reset your password. Click the button below to choose a new one.',
    buttonText: 'Reset password',
    disclaimer: "If you didn't request this, you can safely ignore this email.",
    expiry: 'This link expires in 1 hour.',
  },
} as const;
