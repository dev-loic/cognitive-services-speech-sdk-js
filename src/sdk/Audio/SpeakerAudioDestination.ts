// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { SynthesisAdapterBase } from "../../common.speech/Exports";
import {
    BackgroundEvent,
    createNoDashGuid,
    Events,
    IAudioDestination,
    INumberDictionary
} from "../../common/Exports";
import { AudioStreamFormat, IPlayer } from "../Exports";
import { AudioFormatTag, AudioOutputFormatImpl } from "./AudioOutputFormat";
import { PullAudioOutputStreamImpl } from "./AudioOutputStream";

const MediaDurationPlaceholderSeconds = 60 * 30;

const AudioFormatToMimeType: INumberDictionary<string> = {
    [AudioFormatTag.PCM]: "audio/wav",
    [AudioFormatTag.MP3]: "audio/mpeg",
    [AudioFormatTag.Opus]: "audio/ogg",
};

/**
 * Represents the speaker playback audio destination, which only works in browser.
 * Note: the SDK will try to use <a href="https://www.w3.org/TR/media-source/">Media Source Extensions</a> to play audio.
 * Mp3 format has better supports on Microsoft Edge, Chrome and Safari (desktop), so, it's better to specify mp3 format for playback.
 * @class SpeakerAudioDestination
 * Updated in version 1.12.1
 */
export class SpeakerAudioDestination implements IAudioDestination, IPlayer {
    private readonly privId: string;
    private privFormat: AudioOutputFormatImpl;
    private privAudio: HTMLAudioElement;
    private privMediaSource: MediaSource;
    private privSourceBuffer: SourceBuffer;
    private privPlaybackStarted: boolean = false;
    private privAudioBuffer: ArrayBuffer[];
    private privAppendingToBuffer: boolean = false;
    private privMediaSourceOpened: boolean = false;
    private privIsClosed: boolean;
    private privIsPaused: boolean;
    private privAudioOutputStream: PullAudioOutputStreamImpl;
    private privBytesReceived: number = 0;

    public constructor(audioDestinationId?: string) {
        this.privId = audioDestinationId ? audioDestinationId : createNoDashGuid();
        this.privIsPaused = false;
        this.privIsClosed = false;
    }

    public id(): string {
        return this.privId;
    }

    public write(buffer: ArrayBuffer, cb?: () => void, err?: (error: string) => void): void {
        if (this.privAudioBuffer !== undefined) {
            this.privAudioBuffer.push(buffer);
            this.updateSourceBuffer().then(() => {
                if (!!cb) {
                    cb();
                }
            }, (error: string): void => {
                if (!!err) {
                    err(error);
                }
            });
        } else if (this.privAudioOutputStream !== undefined) {
            this.privAudioOutputStream.write(buffer);
            this.privBytesReceived += buffer.byteLength;
        }
    }

    public close(cb?: () => void, err?: (error: string) => void): void {
        this.privIsClosed = true;
        if (this.privSourceBuffer !== undefined) {
            this.handleSourceBufferUpdateEnd().then(() => {
                if (!!cb) {
                    cb();
                }
            }, (error: string): void => {
                if (!!err) {
                    err(error);
                }
            });
        } else if (this.privAudioOutputStream !== undefined) {
            let receivedAudio = new ArrayBuffer(this.privBytesReceived);
            this.privAudioOutputStream.read(receivedAudio).then((_: number): void => {
                if (this.privFormat.hasHeader) {
                    receivedAudio = SynthesisAdapterBase.addHeader(receivedAudio, this.privFormat);
                }
                const audioBlob = new Blob([receivedAudio], { type: AudioFormatToMimeType[this.privFormat.formatTag] });
                this.privAudio.src = window.URL.createObjectURL(audioBlob);
                this.notifyPlayback().then(() => {
                    if (!!cb) {
                        cb();
                    }
                }, (error: string): void => {
                    if (!!err) {
                        err(error);
                    }
                });
            }, (error: string): void => {
                if (!!err) {
                    err(error);
                }
            });
        }
    }

    set format(format: AudioStreamFormat) {
        if (typeof (AudioContext) !== "undefined" || typeof ((window as any).webkitAudioContext) !== "undefined") {
            this.privFormat = format as AudioOutputFormatImpl;
            const mimeType: string = AudioFormatToMimeType[this.privFormat.formatTag];
            if (mimeType === undefined) {
                // tslint:disable-next-line:no-console
                console.warn(
                    `Unknown mimeType for format ${AudioFormatTag[this.privFormat.formatTag]}.`);

            } else if (typeof (MediaSource) !== "undefined" && MediaSource.isTypeSupported(mimeType)) {
                try {
                    this.privAudio = new Audio();
                    this.privAudioBuffer = [];
                    this.privMediaSource = new MediaSource();
                    this.privAudio.src = URL.createObjectURL(this.privMediaSource);
                    this.privAudio.load();
                } catch (error) {
                    // tslint:disable-next-line:no-console
                    console.warn(`SpeakerAudioDestination setup error: ${error}`);
                    return;
                }
                this.privMediaSource.onsourceopen = (event: Event): void => {
                    this.privMediaSourceOpened = true;
                    this.privMediaSource.duration = MediaDurationPlaceholderSeconds;
                    this.privSourceBuffer = this.privMediaSource.addSourceBuffer(mimeType);
                    this.privSourceBuffer.onupdate = (_: Event) => {
                        this.updateSourceBuffer().catch((reason: string): void => {
                            Events.instance.onEvent(new BackgroundEvent(reason));
                        });
                    };
                    this.privSourceBuffer.onupdateend = (_: Event) => {
                        this.handleSourceBufferUpdateEnd().catch((reason: string): void => {
                            Events.instance.onEvent(new BackgroundEvent(reason));
                        });
                    };
                    this.privSourceBuffer.onupdatestart = (_: Event) => {
                        this.privAppendingToBuffer = false;
                    };
                };
                this.updateSourceBuffer().catch((reason: string): void => {
                    Events.instance.onEvent(new BackgroundEvent(reason));
                });

            } else {
                // tslint:disable-next-line:no-console
                console.warn(
                    `Format ${AudioFormatTag[this.privFormat.formatTag]} could not be played by MSE, streaming playback is not enabled.`);
                this.privAudioOutputStream = new PullAudioOutputStreamImpl();
                this.privAudioOutputStream.format = this.privFormat;
                this.privAudio = new Audio();
            }
        }
    }

    public get isClosed(): boolean {
        return this.privIsClosed;
    }

    public get currentTime(): number {
        if (this.privAudio !== undefined) {
            return this.privAudio.currentTime;
        }
        return -1;
    }

    public pause(): void {
        if (!this.privIsPaused && this.privAudio !== undefined) {
            this.privAudio.pause();
            this.privIsPaused = true;
        }
    }

    public resume(cb?: () => void, err?: (error: string) => void): void {
        if (this.privIsPaused && this.privAudio !== undefined) {
            this.privAudio.play().then(() => {
                if (!!cb) {
                    cb();
                }
            }, (error: string): void => {
                if (!!err) {
                    err(error);
                }
            });
            this.privIsPaused = false;
        }
    }

    public onAudioEnd: (sender: IPlayer) => void;

    public get internalAudio(): HTMLAudioElement {
        return this.privAudio;
    }

    private async updateSourceBuffer(): Promise<void> {
        if (this.privAudioBuffer !== undefined && (this.privAudioBuffer.length > 0) && this.sourceBufferAvailable()) {
            this.privAppendingToBuffer = true;
            const binary = this.privAudioBuffer.shift();
            try {
                this.privSourceBuffer.appendBuffer(binary);
            } catch (error) {
                this.privAudioBuffer.unshift(binary);
                // tslint:disable-next-line:no-console
                console.log(
                    "buffer filled, pausing addition of binaries until space is made");
                return;
            }
            try {
                await this.notifyPlayback();
            } catch (error) {
                // tslint:disable-next-line:no-console
                console.log(`SpeakerAudioDestination.notifyPlayback error: ${error}`);
                return;
            }
        } else if (this.canEndStream()) {
            await this.handleSourceBufferUpdateEnd();
        }
    }

    private async handleSourceBufferUpdateEnd(): Promise<void> {
        if (this.canEndStream() && this.sourceBufferAvailable()) {
            this.privMediaSource.endOfStream();
            await this.notifyPlayback();
        }
    }

    private async notifyPlayback(): Promise<void> {
        if (!this.privPlaybackStarted && this.privAudio !== undefined) {
            this.privAudio.onended = (): void => {
                if (!!this.onAudioEnd) {
                    this.onAudioEnd(this);
                }
            };
            if (!this.privIsPaused) {
                await this.privAudio.play();
            }
            this.privPlaybackStarted = true;
        }
    }

    private canEndStream(): boolean {
        return (this.isClosed && this.privSourceBuffer !== undefined && (this.privAudioBuffer.length === 0)
            && this.privMediaSourceOpened && !this.privAppendingToBuffer && this.privMediaSource.readyState === "open");
    }

    private sourceBufferAvailable(): boolean {
        return (this.privSourceBuffer !== undefined && !this.privSourceBuffer.updating);
    }
}
