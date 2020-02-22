// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {
    IAuthentication,
    IConnectionFactory,
    RecognizerConfig,
    ServiceRecognizerBase,
    SpeechServiceConfig
} from "../../common.speech/Exports";
import { AudioConfigImpl } from "../../sdk/Audio/AudioConfig";
import { Contracts } from "../../sdk/Contracts";
import { AudioConfig,
    ConversationExpirationEventArgs,
    ConversationParticipantsChangedEventArgs,
    ConversationTranslationCanceledEventArgs,
    PropertyCollection,
    Recognizer,
    SessionEventArgs,
    SpeechTranslationConfig} from "../../sdk/Exports";
import { SpeechTranslationConfigImpl } from "../../sdk/SpeechTranslationConfig";
import { ConversationConnectionFactory } from "./ConversationConnectionFactory";
import { ConversationServiceAdapter } from "./ConversationServiceAdapter";
import {
    ConversationReceivedTranslationEventArgs,
    LockRoomEventArgs,
    MuteAllEventArgs,
    ParticipantAttributeEventArgs,
    ParticipantEventArgs,
    ParticipantsListEventArgs } from "./ConversationTranslatorEventArgs";
import {
    ConversationTranslatorCommandTypes,
    ConversationTranslatorMessageTypes,
    IConversationTranslatorRecognizer,
    IEjectParticipantCommand,
    IInstantMessageCommand,
    ILockConversationCommand,
    IMuteAllCommand,
    IMuteCommand } from "./ConversationTranslatorInterfaces";

/**
 * Sends messages to the Conversation Translator websocket and listens for incoming events containing websocket messages.
 * Based off the recognizers in the SDK folder.
 */
export class ConversationTranslatorRecognizer extends Recognizer implements IConversationTranslatorRecognizer {

    private privIsDisposed: boolean;
    private privSpeechRecognitionLanguage: string;

    public constructor(speechConfig: SpeechTranslationConfig, audioConfig?: AudioConfig) {
        const serviceConfigImpl = speechConfig as SpeechTranslationConfigImpl;
        Contracts.throwIfNull(speechConfig, "speechConfig");

        super(audioConfig, serviceConfigImpl.properties, new ConversationConnectionFactory());

        this.privIsDisposed = false;
        this.privProperties = serviceConfigImpl.properties.clone();

    }

    public canceled: (sender: IConversationTranslatorRecognizer, event: ConversationTranslationCanceledEventArgs) => void;
    public conversationExpiration: (sender: IConversationTranslatorRecognizer, event: ConversationExpirationEventArgs) => void;
    public lockRoomCommandReceived: (sender: IConversationTranslatorRecognizer, event: LockRoomEventArgs) => void;
    public muteAllCommandReceived: (sender: IConversationTranslatorRecognizer, event: MuteAllEventArgs) => void;
    public participantJoinCommandReceived: (sender: IConversationTranslatorRecognizer, event: ParticipantEventArgs) => void;
    public participantLeaveCommandReceived: (sender: IConversationTranslatorRecognizer, event: ParticipantEventArgs) => void;
    public participantUpdateCommandReceived: (sender: IConversationTranslatorRecognizer, event: ParticipantAttributeEventArgs) => void;
    public connectionOpened: (sender: IConversationTranslatorRecognizer, event: SessionEventArgs) => void;
    public connectionClosed: (sender: IConversationTranslatorRecognizer, event: SessionEventArgs) => void;
    public translationReceived: (sender: IConversationTranslatorRecognizer, event: ConversationReceivedTranslationEventArgs) => void;
    public participantsListReceived: (sender: IConversationTranslatorRecognizer, event: ParticipantsListEventArgs) => void;
    public participantsChanged: (sender: IConversationTranslatorRecognizer, event: ConversationParticipantsChangedEventArgs) => void;

    /**
     * Return the speech language used by the recognizer
     */
    public get speechRecognitionLanguage(): string {
        return this.privSpeechRecognitionLanguage;
    }

    /**
     * Return the properties for the recognizer
     */
    public get properties(): PropertyCollection {
        return this.privProperties;
    }

    public isDisposed(): boolean {
        return this.privIsDisposed;
    }

    /**
     * Connect to the recognizer
     * @param token
     */
    public connect(token: string, cb?: () => void, err?: (e: string) => void): void {
        try {

            Contracts.throwIfDisposed(this.privIsDisposed);
            Contracts.throwIfNullOrWhitespace(token, "token");
            this.privReco.conversationTranslatorToken = token;
            this.privReco.connect();

            if (!!cb) {
                try {
                    cb();
                } catch (e) {
                    if (!!err) {
                        err(e);
                    }
                }
            }
        } catch (error) {
            if (!!err) {
                if (error instanceof Error) {
                    const typedError: Error = error as Error;
                    err(typedError.name + ": " + typedError.message);
                } else {
                    err(error);
                }
            }

            // Destroy the recognizer.
            // this.dispose(true);
        }
    }

    /**
     * Disconnect from the recognizer
     */
    public disconnect(cb?: () => void, err?: (e: string) => void): void {
        try {

            Contracts.throwIfDisposed(this.privIsDisposed);
            this.privReco.disconnect();

            if (!!cb) {
                try {
                    cb();
                } catch (e) {
                    if (!!err) {
                        err(e);
                    }
                }
            }
        } catch (error) {
            if (!!err) {
                if (error instanceof Error) {
                    const typedError: Error = error as Error;
                    err(typedError.name + ": " + typedError.message);
                } else {
                    err(error);
                }
            }

            // Destroy the recognizer.
            // this.dispose(true);
        }
    }

    /**
     * Send the text message command to the websocket
     * @param conversationId
     * @param participantId
     * @param message
     */
    public sendMessageRequest(conversationId: string, participantId: string, message: string, cb?: () => void, err?: (e: string) => void): void {

        try {

            Contracts.throwIfDisposed(this.privIsDisposed);
            Contracts.throwIfNullOrWhitespace(conversationId, "conversationId");
            Contracts.throwIfNullOrWhitespace(participantId, "participantId");
            Contracts.throwIfNullOrWhitespace(message, "message");

            const command: IInstantMessageCommand = {
                // tslint:disable-next-line: object-literal-shorthand
                participantId: participantId,
                roomId: conversationId,
                text: message,
                type: ConversationTranslatorMessageTypes.instantMessage
            };

            this.privReco.sendMessage(JSON.stringify(command));

            if (!!cb) {
                try {
                    cb();
                } catch (e) {
                    if (!!err) {
                        err(e);
                    }
                }
            }

        } catch (error) {
            if (!!err) {
                if (error instanceof Error) {
                    const typedError: Error = error as Error;
                    err(typedError.name + ": " + typedError.message);
                } else {
                    err(error);
                }
            }

            // Destroy the recognizer.
            this.dispose(true);
        }
    }

    /**
     * Send the lock conversation command to the websocket
     * @param conversationId
     * @param participantId
     * @param isLocked
     */
    public sendLockRequest(conversationId: string, participantId: string, isLocked: boolean, cb?: () => void, err?: (e: string) => void): void {

        try {

            Contracts.throwIfDisposed(this.privIsDisposed);
            Contracts.throwIfNullOrWhitespace(conversationId, "conversationId");
            Contracts.throwIfNullOrWhitespace(participantId, "participantId");
            Contracts.throwIfNullOrUndefined(isLocked, "isLocked");

            const command: ILockConversationCommand = {
                command: ConversationTranslatorCommandTypes.setLockState,
                // tslint:disable-next-line: object-literal-shorthand
                participantId: participantId,
                roomid: conversationId,
                type: ConversationTranslatorMessageTypes.participantCommand,
                value: isLocked
            };

            this.privReco.sendMessage(JSON.stringify(command));

            if (!!cb) {
                try {
                    cb();
                } catch (e) {
                    if (!!err) {
                        err(e);
                    }
                }
            }
        } catch (error) {
            if (!!err) {
                if (error instanceof Error) {
                    const typedError: Error = error as Error;
                    err(typedError.name + ": " + typedError.message);
                } else {
                    err(error);
                }
            }

            // Destroy the recognizer.
            this.dispose(true);
        }
    }

    /**
     * Send the mute all participants command to the websocket
     * @param conversationId
     * @param participantId
     * @param isMuted
     */
    public sendMuteAllRequest(conversationId: string, participantId: string, isMuted: boolean, cb?: () => void, err?: (e: string) => void): void {

        try {

            Contracts.throwIfDisposed(this.privIsDisposed);
            Contracts.throwIfNullOrWhitespace(conversationId, "conversationId");
            Contracts.throwIfNullOrWhitespace(participantId, "participantId");
            Contracts.throwIfNullOrUndefined(isMuted, "isMuted");

            const command: IMuteAllCommand = {
                command: ConversationTranslatorCommandTypes.setMuteAll,
                // tslint:disable-next-line: object-literal-shorthand
                participantId: participantId, // the id of the host
                roomid: conversationId,
                type: ConversationTranslatorMessageTypes.participantCommand,
                value: isMuted
            };

            this.privReco.sendMessage(JSON.stringify(command));

            if (!!cb) {
                try {
                    cb();
                } catch (e) {
                    if (!!err) {
                        err(e);
                    }
                }
            }
        } catch (error) {
            if (!!err) {
                if (error instanceof Error) {
                    const typedError: Error = error as Error;
                    err(typedError.name + ": " + typedError.message);
                } else {
                    err(error);
                }
            }

            // Destroy the recognizer.
            this.dispose(true);
        }
    }

    /**
     * Send the mute participant command to the websocket
     * @param conversationId
     * @param participantId
     * @param isMuted
     */
    public sendMuteRequest(conversationId: string, participantId: string, isMuted: boolean, cb?: () => void, err?: (e: string) => void): void {

        try {

            Contracts.throwIfDisposed(this.privIsDisposed);
            Contracts.throwIfNullOrWhitespace(conversationId, "conversationId");
            Contracts.throwIfNullOrWhitespace(participantId, "participantId");
            Contracts.throwIfNullOrUndefined(isMuted, "isMuted");

            const command: IMuteCommand = {
                command: ConversationTranslatorCommandTypes.setMute,
                // tslint:disable-next-line: object-literal-shorthand
                participantId: participantId, // the id of the participant
                roomid: conversationId,
                type: ConversationTranslatorMessageTypes.participantCommand,
                value: isMuted
            };

            this.privReco.sendMessage(JSON.stringify(command));

            if (!!cb) {
                try {
                    cb();
                } catch (e) {
                    if (!!err) {
                        err(e);
                    }
                }
            }
        } catch (error) {
            if (!!err) {
                if (error instanceof Error) {
                    const typedError: Error = error as Error;
                    err(typedError.name + ": " + typedError.message);
                } else {
                    err(error);
                }
            }

            // Destroy the recognizer.
            this.dispose(true);
        }
    }

    /**
     * Send the eject participant command to the websocket
     * @param conversationId
     * @param participantId
     */
    public sendEjectRequest(conversationId: string, participantId: string, cb?: () => void, err?: (e: string) => void): void {

        try {

            Contracts.throwIfDisposed(this.privIsDisposed);
            Contracts.throwIfNullOrWhitespace(conversationId, "conversationId");
            Contracts.throwIfNullOrWhitespace(participantId, "participantId");

            const command: IEjectParticipantCommand = {
                command: ConversationTranslatorCommandTypes.ejectParticipant,
                // tslint:disable-next-line: object-literal-shorthand
                participantId: participantId,
                roomid: conversationId,
                type: ConversationTranslatorMessageTypes.participantCommand,
            };

            this.privReco.sendMessage(JSON.stringify(command));

            if (!!cb) {
                try {
                    cb();
                } catch (e) {
                    if (!!err) {
                        err(e);
                    }
                }
            }

        } catch (error) {
            if (!!err) {
                if (error instanceof Error) {
                    const typedError: Error = error as Error;
                    err(typedError.name + ": " + typedError.message);
                } else {
                    err(error);
                }
            }

            // Destroy the recognizer.
            this.dispose(true);
        }
    }

    /**
     * Close and dispose the recognizer
     */
    public close(): void {
        Contracts.throwIfDisposed(this.privIsDisposed);

        this.dispose(true);
    }

    /**
     * Dispose the recognizer
     * @param disposing
     */
    protected dispose(disposing: boolean): boolean {
        if (this.privIsDisposed) {
            return;
        }

        if (disposing) {
            // this.implRecognizerStop();
            this.privIsDisposed = true;
            super.dispose(disposing);
        }
    }

    /**
     * Create the config for the recognizer
     * @param speechConfig
     */
    protected createRecognizerConfig(speechConfig: SpeechServiceConfig): RecognizerConfig {
        return new RecognizerConfig(speechConfig, this.privProperties);
    }

    /**
     * Create the service recognizer.
     * The audio source is redundnant here but is required by the implementation.
     * @param authentication
     * @param connectionFactory
     * @param audioConfig
     * @param recognizerConfig
     */
    protected createServiceRecognizer(
        authentication: IAuthentication,
        connectionFactory: IConnectionFactory,
        audioConfig: AudioConfig,
        recognizerConfig: RecognizerConfig): ServiceRecognizerBase {

        const audioSource: AudioConfigImpl = audioConfig as AudioConfigImpl;

        return new ConversationServiceAdapter(authentication, connectionFactory, audioSource, recognizerConfig, this);
    }

}