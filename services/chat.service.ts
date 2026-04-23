import {EventEmitter, Injectable} from '@angular/core';
import {HubConnection, HubConnectionBuilder, HttpTransportType, LogLevel} from '@microsoft/signalr';
import {IMessage} from '../models/message';
import {ISignalRDataFragment} from '../models/ISignalRDataFragment';
import {SignalRSubscriptionReceivedClass} from '../models/signalRSubscriptionReceivedClass';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';

@Injectable()
export class ChatService {
  messageReceived = new EventEmitter<SignalRSubscriptionReceivedClass>();
  // tslint:disable-next-line:ban-types
  connectionEstablished = new EventEmitter<Boolean>();

  private connectionIsEstablished = false;
  // tslint:disable-next-line:variable-name
  private _hubConnection: HubConnection | undefined;

  private readonly token = 'TOKEN';

  constructor(private http: HttpClient) {
    this.createConnection();
    this.registerOnServerEvents();
    this.startConnection();
  }

  sendMessage(message: IMessage, reception: number, interactionType: number) {
    if (this._hubConnection === undefined) return;

    console.log('sendMessage called with message:', message, 'and reception:', reception, 'and interactionType:', interactionType);

    console.log(`Using NewChatMessageNew for all interaction types`);
    this._hubConnection.invoke('NewChatMessageNew', message.message, message.chatId, reception)
      .then(_ => {
        console.log('Message sent successfully via NewChatMessageNew');
      })
      .catch(err => {
        console.error('Error sending message via NewChatMessageNew:', err);
        this._hubConnection?.invoke('NewChatMessageIntent', message.message, message.chatId, interactionType, reception)
          .then(_ => {
            console.log('Message sent successfully via fallback NewChatMessageIntent');
          })
          .catch(err2 => console.error('Error sending message via fallback NewChatMessageIntent:', err2));
      });
  }

  createPortfolioALM(exploreRequest: any): Observable<any> {
    console.log('[DEBUG_LOG] Entered createPortfolioALM method');
    const url = 'https://praams.net:6045/back/praamsuserportfolios/Construct/CreatePortfolioALM';
    const headers = new HttpHeaders({
      'Authorization': this.token,
      'Content-Type': 'application/json',
      'accept': 'text/plain'
    });

    console.log('[DEBUG_LOG] Calling CreatePortfolioALM with headers:', headers.keys());
    console.log('[DEBUG_LOG] Authorization value starts with:', this.token.substring(0, 15), '...');

    return this.http.post(url, exploreRequest, { headers });
  }

  storePortfolio(portfolioData: any): Observable<any> {
    console.log('[DEBUG_LOG] Entered storePortfolio method');
    const name = portfolioData.item.portfolioName;
    const url = `https://praams.net:6045/back/praamsuserportfolios/Main/StoreFromConstruct?companyId=3&name=${encodeURIComponent(name)}`;
    const headers = new HttpHeaders({
      'Authorization': this.token,
      'Content-Type': 'application/json',
      'accept': 'text/plain'
    });

    console.log('[DEBUG_LOG] Calling StoreFromConstruct with name:', name);
    return this.http.post(url, portfolioData.item, { headers });
  }

  listPortfolios(companyId: string): Observable<any> {
    console.log('[DEBUG_LOG] Entered listPortfolios method for companyId:', companyId);
    const url = `https://praams.net:6045/Portfolio/List?companyId=${companyId}`;
    const headers = new HttpHeaders({
      'Authorization': this.token,
      'Content-Type': 'application/json',
      'accept': 'text/plain'
    });

    return this.http.get(url, { headers });
  }

  getPortfolio(id: number): Observable<any> {
    console.log('[DEBUG_LOG] Entered getPortfolio method for id:', id);
    const url = `https://praams.net:6045/Portfolio/Get?id=${id}`;
    const headers = new HttpHeaders({
      'Authorization': this.token,
      'Content-Type': 'application/json',
      'accept': 'text/plain'
    });

    return this.http.get(url, { headers });
  }

  getMainPortfolio(portfolioId: number): Observable<any> {
    console.log('[DEBUG_LOG] Entered getMainPortfolio method for portfolioId:', portfolioId);
    const url = `https://praams.net:6045/Main/Get?portfolioId=${portfolioId}`;
    const headers = new HttpHeaders({
      'Authorization': this.token,
      'Content-Type': 'application/json',
      'accept': 'text/plain'
    });

    return this.http.get(url, { headers });
  }

  downloadPortfolioPdf(portfolioId: number, type: string = '', isFull: boolean = false): Observable<Blob> {
    console.log('[DEBUG_LOG] Entered downloadPortfolioPdf method for portfolioId:', portfolioId);
    const url = `https://praams.net:6045/Portfolio/DownloadAsPdf?portfolioId=${portfolioId}&type=${type}&isFull=${isFull}`;
    const headers = new HttpHeaders({
      'Authorization': this.token,
      'accept': 'application/pdf'
    });

    return this.http.get(url, { headers, responseType: 'blob' });
  }

  private createConnection() {
    this._hubConnection = new HubConnectionBuilder()
      .withUrl('https://praams.net:5015/Hub', {
        accessTokenFactory: () => {
          console.log('SignalR accessTokenFactory called, providing token');
          return this.token;
        }
      })
      .configureLogging(LogLevel.Trace)
      .withAutomaticReconnect()
      .build();
  }

  private startConnection(): void {
    if (this._hubConnection === undefined) return;

    this._hubConnection
      .start()
      .then(() => {
        this.connectionIsEstablished = true;
        console.log('Hub connection started');
        this.connectionEstablished.emit(true);

        if (this._hubConnection === undefined) return;
      })
      .catch(err => {
        console.error('SignalR connection error details:', err);
        console.log('Error message:', err.message);
        console.log('Error stack:', err.stack);
        console.log('Error while establishing connection, retrying...', err.toString());
        setTimeout(() => {
          this.startConnection();
        }, 5000);
      });
  }

  private registerOnServerEvents(): void {
    if (this._hubConnection === undefined) return;

    const subscriptions = ['ChatAllowed', 'ChatReply', 'ChatIntermediateReply', 'ChatStatus', 'ischatallowed'];

    subscriptions.forEach(eventName => {
      this._hubConnection?.on(eventName, (...data) => {
        console.log(`SignalR event received: ${eventName}`, data);
        const normalizedEventName = eventName === 'ischatallowed' ? 'ChatAllowed' : eventName;

        let payload = data[0];
        if (eventName === 'ischatallowed' && typeof data[0].payload === 'string') {
          try {
            const parsed = JSON.parse(data[0].payload);
            if (typeof parsed === 'boolean') {
              payload = {
                ...data[0],
                payload: JSON.stringify({
                  chatId: 'system',
                  message: parsed ? 'Chat is allowed' : 'Chat is not allowed'
                })
              };
            }
          } catch (e) {
            // If it fails to parse or isn't a boolean, we leave it as is
          }
        }

        this.handleSignalRDataFragment(normalizedEventName, payload);
      });
    });
  }

  private sessionStorage: Map<string, string[]> = new Map<string, string[]>();

  private handleSignalRDataFragment(eventName: string, data: ISignalRDataFragment) {

    if (data.total === 1 && data.current === 0) {
      this.messageReceived.emit({EventName: eventName, Data: [JSON.parse(data.payload)]});

      return;
    }

    const sessionStorageState: string[] | undefined = this.sessionStorage.get(data.streamId);

    if (sessionStorageState) {
      sessionStorageState[data.current] = data.payload;

      if ((sessionStorageState.every(x => x !== '')) && (sessionStorageState.length === data.total)) {
        let signalRObject = this.concatFullArray(eventName, sessionStorageState);
        this.messageReceived.emit(signalRObject);
        this.sessionStorage.delete(data.streamId);
      } else {
        sessionStorageState[data.current] = data.payload;
        this.sessionStorage.set(data.streamId, sessionStorageState);
      }
    } else {
      const newSegmentsArray: string[] = new Array(data.total);
      for (let i = 0; i < data.total; i++) {
        newSegmentsArray[i] = '';
      }
      newSegmentsArray[data.current] = data.payload;
      this.sessionStorage.set(data.streamId, newSegmentsArray);
    }
  }

  private concatFullArray(eventName: string, items: string[]): SignalRSubscriptionReceivedClass {
    let finalString = '';
    items.forEach(item => {
      finalString += item;
    });

    return {EventName: eventName, Data: [JSON.parse(finalString)]};
  }
}
