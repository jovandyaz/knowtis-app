export const auth = {
  verifyEmail: {
    title: 'Verify your email',
    preview: 'Please verify your email address to get started',
    greeting: 'Hi {{name}},',
    instruction:
      'Thanks for signing up for Knowtis! Please verify your email address by clicking the button below.',
    buttonText: 'Verify email',
    disclaimer:
      "If you didn't create an account, you can safely ignore this email.",
    expiry: 'This link expires in 24 hours.',
  },
  resetPassword: {
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
