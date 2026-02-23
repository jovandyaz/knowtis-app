export interface EmailModuleOptions {
  readonly provider: 'resend' | 'console';
  readonly resend?: { readonly apiKey: string };
  readonly defaults: { readonly from: string };
}
