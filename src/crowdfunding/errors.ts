export class CampaignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignError";
  }
}
