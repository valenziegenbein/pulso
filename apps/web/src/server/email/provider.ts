export interface RenderedEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  sendEmail(email: RenderedEmail): Promise<{ messageId: string }>;
  verifyConnection(): Promise<boolean>;
}

export class MockEmailProvider implements EmailProvider {
  readonly name = 'MOCK';
  readonly deliveries: RenderedEmail[] = [];

  constructor(private readonly fail = false) {}

  async sendEmail(email: RenderedEmail): Promise<{ messageId: string }> {
    if (this.fail) throw new Error('Fallo sintético del proveedor.');
    this.deliveries.push(email);
    return { messageId: `mock-email-${this.deliveries.length}` };
  }

  async verifyConnection(): Promise<boolean> { return !this.fail; }
}
