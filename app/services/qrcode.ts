import { ImageSource, Observable, PageTransition, Screen, SharedTransition } from '@nativescript/core';
import { QRCodeSingleData, detectQRCode, detectQRCodeFromFile, generateQRCodeImage, generateQRCodeSVG } from 'plugin-nativeprocessor';
import { OCRDocument, OCRPage } from '~/models/OCRDocument';
import { QRCODE_RESIZE_THRESHOLD } from '~/utils/constants';
import { loadImage, recycleImages } from '~/utils/images';
import { navigate, showModal } from '~/utils/svelte/ui';
import { screenHeightDips, screenWidthDips } from '~/variables';

const TAG = 'QRCodeService';

export enum FORMATS {
    QR_CODE = 'QRCode',
    EAN_8 = 'EAN-8',
    EAN_13 = 'EAN-13',
    UPC_A = 'UPC-A',
    UPC_E = 'UPC-E',
    AZTEC = 'Aztec',
    CODABAR = 'Codabar',
    CODE_39 = 'Code39',
    CODE_93 = 'Code93',
    CODE_128 = 'Code128',
    DATABAR = 'DataBar',
    DATABAREXPANDED = 'DataBarExpanded',
    DATA_MATRIX = 'DataMatrix',
    // DXFILMEDGE = 'DXFilmEdge',
    ITF = 'ITF',
    MAXICODE = 'MaxiCode',
    MICROQRCODE = 'MicroQRCode',
    PDF_417 = 'PDF417',
    RMQRCODE = 'rMQRCode'
}

export async function getQRCodeSVG(qrcode: QRCodeSingleData, width: number, color: string = '#000000', options?) {
    return generateQRCodeSVG(qrcode.text, qrcode.format, width, {
        color,
        ...(options || {})
    });
}

export class QRCodeService extends Observable {
    async detectQRcode(document: OCRDocument, pageIndex: number) {
        const page = document.pages[pageIndex];
        const qrcode = await detectQRCodeFromFile(page.imagePath, {
            resizeThreshold: QRCODE_RESIZE_THRESHOLD,
            rotation: page.rotation
        });
        if (qrcode?.length) {
            await document.updatePage(pageIndex, {
                qrcode: (document.pages[pageIndex].qrcode || []).concat(qrcode)
            });
            return qrcode;
        }
    }

    async createQRCode() {
        const CreateBarcode = (await import('~/components/qrcode/CreateBarcode.svelte')).default;
        return showModal({
            page: CreateBarcode,
            fullscreen: true,
            props: {}
        }) as any as Promise<{ text: string; format: string }>;
    }

    async showQRCode(pages: OCRPage[], document?: OCRDocument, startPageIndex = 0) {
        const qrcodes = pages.reduce((acc, page) => acc.concat(page.qrcode || []), []);
        const component = (await import('~/components/FullScreenImageViewer.svelte')).default;
        navigate({
            page: component,
            transition: undefined,
            // transition: { name: 'slideLeft', duration: 300, curve: 'easeOut' },
            props: {
                refreshOnOrientationChange: false,
                useSVG: true,
                labelColor: 'black',
                backgroundColor: 'white',
                statusBarStyle: 'light',
                keepScreenAwake: true,
                screenBrightness: 1,
                images: qrcodes.map((qrcode, index) => ({
                    name: document?.name,
                    subtitle: qrcode.text,
                    sharedTransitionTag: 'qrcode' + index,
                    labelSharedTransitionTag: 'qrcodelabel' + index,
                    // colorMatrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 1, 1],
                    margin: '0 10 0 10',
                    svg: async () => getQRCodeSVG(qrcode, screenWidthDips)
                })),
                startPageIndex
            }
        });
    }
}
export const qrcodeService = new QRCodeService();
