export class SignalRSubscriptionReceivedClass {
  EventName: string;
  Data: any[];

  constructor(eventName: string, data: any[]) {
    this.EventName = eventName;
    this.Data = data;
  }
}
