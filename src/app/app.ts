import {ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import {IChatAllowed, IChatContextResponse, IChatStatus, IMessage, IPortfolioBrief, IReceptionInfo} from '../../models/message';
import {ChatService} from '../../services/chat.service';
import {DatePipe, DecimalPipe} from '@angular/common';
import {v4 as uuidv4} from 'uuid';
import {SignalRSubscriptionReceivedClass} from '../../models/signalRSubscriptionReceivedClass';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {interval, Subscription} from 'rxjs';

import {MarkdownPipe} from './pipes/markdown.pipe';

@Component({
  selector: 'app-root',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, FormsModule, MarkdownPipe],
  providers: [ChatService],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App implements OnInit, OnDestroy {
  activeWindow: number = 1;
  private _inputMode: 'construct' | 'manage' = 'construct';
  get inputMode(): 'construct' | 'manage' {
    return this._inputMode;
  }
  set inputMode(value: 'construct' | 'manage') {
    console.log('[DEBUG_LOG] inputMode changed from', this._inputMode, 'to', value);
    this._inputMode = value;
  }

  private timerSubscription: Subscription | undefined;

  txtMessage: string | undefined = '';
  chatId: string = uuidv4().toString();
  messages: IMessage[] = [];
  statuses: IMessage[] = [];
  portfolios: IPortfolioBrief[] = [];

  receptions: IReceptionInfo[] = [
    {
      receptionId: 1,
      reception: 'Cifra'
    },
    {
      receptionId: 35,
      reception: 'EU'
    },
    {
      receptionId: 87,
      reception: 'TFOS'
    }
  ]

  selectedReception: IReceptionInfo | undefined = this.receptions[0];
  portfolioIdMap: {[name: string]: number} = {};

  // tslint:disable-next-line:variable-name
  constructor(private chatService: ChatService,
              private changeDetectorRef: ChangeDetectorRef) {
    this.subscribeToEvents();
  }

  setWindow(windowNumber: number): void {
    this.activeWindow = windowNumber;
    if (windowNumber === 2) {
      this.fetchPortfolios();
    }
    this.changeDetectorRef.detectChanges();
  }

  openPortfolio(id: number): void {
    const portfolio = this.portfolios.find(p => p.id === id);
    if (!portfolio) return;

    if (portfolio.isOpen) {
      portfolio.isOpen = false;
      this.changeDetectorRef.detectChanges();
      return;
    }

    if (portfolio.details) {
      portfolio.isOpen = true;
      this.changeDetectorRef.detectChanges();
      return;
    }

    console.log('[DEBUG_LOG] Opening portfolio in Manage tab, id:', id);
    this.chatService.getMainPortfolio(id).subscribe({
      next: (rawRes: any) => {
        console.log('[DEBUG_LOG] getMainPortfolio success:', rawRes);
        let res = rawRes;
        if (typeof rawRes === 'string') {
          try {
            res = JSON.parse(rawRes);
          } catch (e) {
            console.warn('[DEBUG_LOG] Failed to parse res as JSON:', rawRes);
          }
        }

        if (res) {
          portfolio.details = res.item ? res : { item: res };
          portfolio.isOpen = true;
          this.changeDetectorRef.detectChanges();
        }
      },
      error: (err: any) => {
        console.error('[DEBUG_LOG] Error fetching portfolio details:', err);
      }
    });
  }

  downloadPortfolio(id: number, name: string): void {
    console.log('[DEBUG_LOG] Downloading portfolio PDF, id:', id);
    this.chatService.downloadPortfolioPdf(id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      },
      error: (err: any) => {
        console.error('[DEBUG_LOG] Error downloading PDF:', err);
      }
    });
  }

  private fetchPortfolios(): void {
    const companyId = '3';
    console.log('[DEBUG_LOG] Fetching portfolios for companyId:', companyId);
    this.chatService.listPortfolios(companyId).subscribe({
      next: (res) => {
        console.log('[DEBUG_LOG] listPortfolios response:', res);
        if (Array.isArray(res)) {
          this.portfolios = res.map((p: any) => ({
            ...p,
            id: p.id || p.portfolioId
          }));
        } else if (res && Array.isArray(res.items)) {
          this.portfolios = res.items.map((p: any) => ({
            ...p,
            id: p.id || p.portfolioId
          }));
        } else if (res && Array.isArray(res.item)) {
          this.portfolios = res.item.map((p: any) => ({
            ...p,
            id: p.id || p.portfolioId
          }));
        } else {
          console.warn('[DEBUG_LOG] Unrecognized response format for listPortfolios');
        }

        // Save name -> id mapping
        this.portfolios.forEach(p => {
          if (p.name && p.id) {
            this.portfolioIdMap[p.name] = p.id;
          }
        });

        this.changeDetectorRef.detectChanges();
      },
      error: (err) => {
        console.error('[DEBUG_LOG] Error fetching portfolios:', err);
      }
    });
  }

  ngOnInit(): void {
    if (this.receptions.length > 0) {
      this.selectedReception = this.receptions[0]; // Set the code of the first item
    }

    this.addGreetingMessage();

    this.timerSubscription = interval(1000).subscribe(() => {
      // Speed up the bot check from 4 seconds to 1 second
      this.checkBot();
    });
  }

  ngOnDestroy() {
    // Clean up the subscription when the component is destroyed
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }

    this.chatService.messageReceived.unsubscribe();
  }

  sendMessage(): void {
    if (this.txtMessage) {
      let message = {
        chatId: this.chatId,
        questionId: uuidv4().toString(),
        type: 'sent',
        message: this.txtMessage,
        date: new Date()
      } as IMessage;

      this.messages = [...this.messages, message];
      this.changeDetectorRef.detectChanges();

      const interactionType = this.inputMode === 'construct' ? 3 : 5;
      console.log('interactionType:', interactionType, 'current inputMode:', this.inputMode);
      this.chatService.sendMessage(message, this.selectedReception?.receptionId ?? 1, interactionType);
      this.txtMessage = '';
    }
  }

  savePortfolio(portfolioData: any): void {
    if (portfolioData) {
      console.log('[DEBUG_LOG] Calling chatService.storePortfolio...');
      this.chatService.storePortfolio(portfolioData).subscribe({
        next: (res) => {
          console.log('[DEBUG_LOG] StoreFromConstruct success:', res);
          const successMessage = {
            chatId: this.chatId,
            questionId: uuidv4().toString(),
            type: 'received',
            message: 'Portfolio saved successfully! ' + (res.message || ''),
            date: new Date()
          } as IMessage;
          this.messages = [...this.messages, successMessage];
          this.changeDetectorRef.detectChanges();
        },
        error: (err) => {
          console.error('[DEBUG_LOG] StoreFromConstruct error:', err);
          const errorMessage = {
            chatId: this.chatId,
            questionId: uuidv4().toString(),
            type: 'received',
            message: 'Error saving portfolio: ' + (err.error?.message || err.message || 'Unknown error'),
            date: new Date()
          } as IMessage;
          this.messages = [...this.messages, errorMessage];
          this.changeDetectorRef.detectChanges();
        }
      });
    }
  }

  private subscribeToEvents(): void {

    this.chatService.messageReceived.subscribe((message: SignalRSubscriptionReceivedClass) => {
      console.log('App component received message:', message);

      if (message.EventName === 'ChatStatus') {
        let payload = message.Data[0] as IChatStatus;
        console.warn('ChatStatus payload details:', payload);

        if (payload.chatId === this.chatId) {
          const botMessage = payload.response || payload.status || '';

          if (botMessage && botMessage.startsWith('Ready to make a portfolio on base of restrictions')) {
            console.log('[DEBUG_LOG] Suppressing status message:', botMessage);
            return;
          }

          if (botMessage) {
            let msg = {
              chatId: payload.chatId,
              questionId: payload.questionId || uuidv4().toString(),
              type: 'bot',
              message: botMessage,
              date: new Date()
            } as IMessage;

            this.messages = [...this.messages, msg];
            this.changeDetectorRef.detectChanges();

            this.statuses = [...this.statuses, msg];
          }
        } else {
          console.warn('[DEBUG_LOG] ChatId mismatch in ChatStatus:', payload.chatId, 'vs', this.chatId);
        }
      }

      if (message.EventName === 'ChatReply' || message.EventName === 'ChatIntermediateReply') {
        let payload = message.Data[0] as IChatContextResponse;
        console.warn('ChatReply/Intermediate payload details:', payload);

        console.log('[DEBUG_LOG] Full payload received:', payload);
        const exploreRequest = payload.exploreRequest;
        console.log('[DEBUG_LOG] Extracted exploreRequest:', exploreRequest);

        if (payload.intentType === 5 || (this.inputMode === 'manage' && (payload.intentType === 3 || payload.intentType === 5))) {
          console.log('[DEBUG_LOG] Handling as portfolioData (intentType 5 or Manage mode override)');

          let port2Data = exploreRequest;
          if (exploreRequest) {
             let parsedExploreRequest = exploreRequest;
             if (typeof exploreRequest === 'string') {
               try {
                 parsedExploreRequest = JSON.parse(exploreRequest);
                 console.log('[DEBUG_LOG] Parsed exploreRequest from string:', parsedExploreRequest);
               } catch (e) {
                 console.warn('[DEBUG_LOG] Failed to parse exploreRequest string:', e);
               }
             }

             if (parsedExploreRequest && typeof parsedExploreRequest === 'object') {
                if (parsedExploreRequest['port2']) {
                   console.log('[DEBUG_LOG] port2 found in exploreRequest');
                   port2Data = parsedExploreRequest['port2'];
                } else if (parsedExploreRequest['item'] && parsedExploreRequest['item']['port2']) {
                   console.log('[DEBUG_LOG] port2 found in exploreRequest.item');
                   port2Data = parsedExploreRequest['item']['port2'];
                } else {
                   port2Data = parsedExploreRequest;
                }
             }
          }

          console.log('[DEBUG_LOG] port2Data after extraction:', port2Data);

          const portfolioData = port2Data ? (port2Data.item ? port2Data : { item: port2Data }) : null;

          console.log('[DEBUG_LOG] portfolioData:', portfolioData);

          if (portfolioData) {
            let portfolioDetails = '';

            try {
              portfolioDetails = JSON.stringify(port2Data, null, 2);
            } catch (e) {
              console.warn('[DEBUG_LOG] Failed to stringify port2Data:', e);
              portfolioDetails = String(port2Data);
            }

            let summaryText = `Portfolio: ${'New Portfolio'} \n(${portfolioDetails})`;

            const apiMessage = {
              chatId: this.chatId,
              questionId: payload.questionId || uuidv4().toString(),
              type: 'received',
              message: summaryText,
              date: new Date(),
              isPortfolio: true,
              portfolioData: portfolioData
            } as IMessage;
            console.log('messages length BEFORE:', this.messages.length);

            this.messages = [...this.messages, apiMessage];

            console.log('messages length AFTER:', this.messages.length);
            this.changeDetectorRef.detectChanges();
          } else {
            console.warn('[DEBUG_LOG] No exploreRequest found in payload');
          }
        }

        if (exploreRequest && payload.intentType !== 5 && !(this.inputMode === 'manage' && (payload.intentType === 3 || payload.intentType === 5))) {
          console.log('[DEBUG_LOG] Calling chatService.createPortfolioALM...');
          this.chatService.createPortfolioALM(exploreRequest).subscribe({
            next: (rawRes) => {
              console.log('[DEBUG_LOG] CreatePortfolioALM success:', rawRes);
              let res = rawRes;
              if (typeof rawRes === 'string') {
                try {
                  res = JSON.parse(rawRes);
                  console.log('[DEBUG_LOG] Parsed res from string:', res);
                } catch (e) {
                  console.warn('[DEBUG_LOG] Failed to parse res as JSON:', rawRes);
                }
              }

              if (res) {
                const portfolioData = res.item ? res : { item: res };
                const apiMessage = {
                  chatId: this.chatId,
                  questionId: uuidv4().toString(),
                  type: 'received',
                  message: typeof res === 'string' ? res : JSON.stringify(res, null, 2),
                  date: new Date(),
                  isPortfolio: true,
                  portfolioData: portfolioData
                } as IMessage;

                console.log('[DEBUG_LOG] Created apiMessage with isPortfolio:', apiMessage.isPortfolio);
                console.log('[DEBUG_LOG] apiMessage.portfolioData.item exists?', !!apiMessage.portfolioData?.item);

                this.messages = [...this.messages, apiMessage];
                this.changeDetectorRef.detectChanges();
              }
            },
            error: (err) => {
              console.error('CreatePortfolioALM error:', err);
              const errorMessage = {
                chatId: this.chatId,
                questionId: uuidv4().toString(),
                type: 'received',
                message: 'Error creating portfolio ALM: ' + (err.message || 'Unknown error'),
                date: new Date()
              } as IMessage;
              this.messages = [...this.messages, errorMessage];
              this.changeDetectorRef.detectChanges();
            }
          });
        }

        if (payload.chatId === this.chatId) {
          this.FilterBotMessages();

          let botReplyText = payload.mainContext?.payload || (payload as any).message || (payload as any).response || '';

          if (botReplyText && botReplyText.startsWith('Ready to make a portfolio on base of restrictions')) {
            console.log('[DEBUG_LOG] Suppressing reply message:', botReplyText);
            return;
          }

          if (botReplyText) {
            if (payload.intentType === 5 && exploreRequest) {
              console.log('[DEBUG_LOG] Suppressing bot reply text because portfolio was already displayed for intent 5');
              return;
            }

            let msg = {
              chatId: payload.chatId,
              questionId: payload.questionId || uuidv4().toString(),
              type: 'received',
              message: botReplyText,
              date: new Date()
            } as IMessage;

            this.messages = [...this.messages, msg];
            this.changeDetectorRef.detectChanges();
          }
        } else {
          console.warn('[DEBUG_LOG] ChatId mismatch in ChatReply:', payload.chatId, 'vs', this.chatId);
        }
      }

      if (message.EventName === 'ChatAllowed') {
        let payload = message.Data[0] as IChatAllowed;
        console.warn('ChatAllowed payload details (suppressed bubble):', payload);
      }
    });
  }

  private FilterBotMessages() {
    this.messages = [...this.messages.filter(x => x.type !== 'bot')];
    this.changeDetectorRef.detectChanges();
  }

  clearMessage() {
    this.messages = [];
    this.addGreetingMessage();
    this.changeDetectorRef.detectChanges();
  }

  private addGreetingMessage(): void {
    this.messages = [
      {
        chatId: this.chatId,
        questionId: uuidv4().toString(),
        type: 'received',
        message: 'Welcome! How can I help you?',
        date: new Date()
      } as IMessage
    ];
  }

  private checkBot() {

    if (this.statuses.length === 0) return;

    this.FilterBotMessages();

    let questionsReplied = this.messages
      .filter(x => x.type === 'received')
      .map(x => x.questionId);

    this.statuses = this.statuses
      .filter(x => !questionsReplied.includes(x.questionId))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (this.statuses.length === 0) return;

    const removedItem = this.statuses.shift();

    if (removedItem !== undefined) {
      this.messages = [...this.messages, removedItem];
    }

    this.changeDetectorRef.detectChanges();
  }
}
