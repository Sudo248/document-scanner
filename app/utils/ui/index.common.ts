import { ConfirmOptions } from '@nativescript/core/ui/dialogs/dialogs-common';
import { request } from '@nativescript-community/perms';
import { openFilePicker, pickFolder } from '@nativescript-community/ui-document-picker';
import { Label } from '@nativescript-community/ui-label';
import { showBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
import { AlertDialog, MDCAlertControlerOptions, alert, confirm, prompt } from '@nativescript-community/ui-material-dialogs';
import { SnackBarOptions, showSnack as mdShowSnack } from '@nativescript-community/ui-material-snackbar';
import { HorizontalPosition, PopoverOptions, VerticalPosition } from '@nativescript-community/ui-popover';
import { closePopover, showPopover } from '@nativescript-community/ui-popover/svelte';
import {
    AlertOptions,
    Animation,
    AnimationDefinition,
    Application,
    ApplicationSettings,
    File,
    GridLayout,
    ImageSource,
    ObservableArray,
    PageTransition,
    SharedTransition,
    Utils,
    View,
    knownFolders,
    path
} from '@nativescript/core';
import { SDK_VERSION, copyToClipboard, debounce, openFile, openUrl } from '@nativescript/core/utils';
import { create as createImagePicker } from '@nativescript/imagepicker';
import dayjs from 'dayjs';
import {
    CropResult,
    Quads,
    cropDocumentFromFile,
    detectQRCodeFromFile,
    getFileName,
    getImageSize,
    getJSONDocumentCornersFromFile,
    importPdfToTempImages,
    printPDF,
    processFromFile
} from 'plugin-nativeprocessor';
import type { ComponentProps } from 'svelte';
import { showModal } from '~/utils/svelte/ui';
import { ComponentInstanceInfo, resolveComponentElement } from 'svelte-native/dom';
import { get } from 'svelte/store';
import type LoadingIndicator__SvelteComponent_ from '~/components/common/LoadingIndicator.svelte';
import LoadingIndicator from '~/components/common/LoadingIndicator.svelte';
import type OptionSelect__SvelteComponent_ from '~/components/common/OptionSelect.svelte';
import type BottomSnack__SvelteComponent_ from '~/components/widgets/BottomSnack.svelte';
import BottomSnack from '~/components/widgets/BottomSnack.svelte';
import { cleanFilename, getFileNameForDocument, getFormatedDateForFilename, l, lc } from '~/helpers/locale';
import { ImportImageData, OCRDocument, OCRPage, PageData } from '~/models/OCRDocument';
import { ocrService } from '~/services/ocr';
import { getTransformedImage } from '~/services/pdf/PDFExportCanvas.common';
import { exportPDFAsync } from '~/services/pdf/PDFExporter';
import { securityService } from '~/services/security';
import {
    ALWAYS_PROMPT_CROP_EDIT,
    ANDROID_CONTENT,
    AREA_SCALE_MIN_FACTOR,
    COLOR_PALETTE_RESIZE_THRESHOLD,
    CROP_ENABLED,
    DEFAULT_EXPORT_DIRECTORY,
    DOCUMENT_NOT_DETECTED_MARGIN,
    IMG_COMPRESS,
    IMG_FORMAT,
    PDFImportImages,
    PDF_EXT,
    PDF_IMPORT_IMAGES,
    PREVIEW_RESIZE_THRESHOLD,
    QRCODE_RESIZE_THRESHOLD,
    SEPARATOR,
    SETTINGS_ALWAYS_PROMPT_CROP_EDIT,
    SETTINGS_CROP_ENABLED,
    SETTINGS_IMAGE_EXPORT_FORMAT,
    SETTINGS_IMAGE_EXPORT_QUALITY,
    SETTINGS_IMPORT_PDF_IMAGES,
    TRANSFORMS_SPLIT,
    USE_SYSTEM_CAMERA,
    getImageExportSettings
} from '~/utils/constants';
import { PermissionError, SilentError } from '~/utils/error';
import { showError } from '../showError';
import { recycleImages } from '~/utils/images';
import { share } from '~/utils/share';
import { goBack } from '~/utils/svelte/ui';
import { showToast } from '~/utils/ui';
import { colors, fontScale, screenWidthDips } from '~/variables';
import { navigate } from '../svelte/ui';
import { doInBatch, saveImage } from '../utils';

export { ColorMatricesTypes, getColorMatrix } from '~/utils/matrix';

export type { ColorMatricesType } from '~/utils/matrix';

export async function showSnack(options: SnackBarOptions) {
    try {
        return mdShowSnack(options);
    } catch (error) {}
}

// export interface ComponentInstanceInfo<T extends ViewBase = View, U = SvelteComponent> {
//     element: NativeViewElementNode<T>;
//     viewInstance: U;
// }

// export function resolveComponentElement<T>(viewSpec: typeof SvelteComponent<T>, props?: T): ComponentInstanceInfo {
//     const dummy = createElement('fragment', window.document as any);
//     const viewInstance = new viewSpec({ target: dummy, props });
//     const element = dummy.firstElement() as NativeViewElementNode<View>;
//     return { element, viewInstance };
// }

export function timeout(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openLink(url) {
    try {
        // const available = await InAppBrowser.isAvailable();
        // if (available) {
        //     const result = await InAppBrowser.open(url, {
        //         // iOS Properties
        //         dismissButtonStyle: 'close',
        //         preferredBarTintColor: colorPrimary,
        //         preferredControlTintColor: 'white',
        //         readerMode: false,
        //         animated: true,
        //         enableBarCollapsing: false,
        //         // Android Properties
        //         showTitle: true,
        //         toolbarColor: colorPrimary,
        //         secondaryToolbarColor: 'white',
        //         enableUrlBarHiding: true,
        //         enableDefaultShare: true,
        //         forceCloseOnRedirection: false,
        //     });
        // } else {
        openUrl(url);
        // }
    } catch (error) {
        alert({
            title: 'Error',
            message: error.message,
            okButtonText: 'Ok'
        });
    }
}

export interface ShowLoadingOptions {
    title?: string;
    text: string;
    progress?: number;
    onButtonTap?: () => void;
}

let loadingIndicator: AlertDialog & { instance?: LoadingIndicator__SvelteComponent_ };
let showLoadingStartTime: number = null;
function getLoadingIndicator() {
    if (!loadingIndicator) {
        const componentInstanceInfo = resolveComponentElement(LoadingIndicator, {});
        const view: View = componentInstanceInfo.element.nativeView;
        // const stack = new StackLayout()
        loadingIndicator = new AlertDialog({
            view,
            cancelable: false
        });
        loadingIndicator.instance = componentInstanceInfo.viewInstance as LoadingIndicator__SvelteComponent_;
    }
    return loadingIndicator;
}
export function updateLoadingProgress(msg: Partial<ShowLoadingOptions>) {
    if (showingLoading()) {
        const loadingIndicator = getLoadingIndicator();
        const props = {
            progress: msg.progress
        };
        if (msg.text) {
            props['text'] = msg.text;
        }
        loadingIndicator.instance.$set(props);
    }
}
export async function showLoading(msg?: string | ShowLoadingOptions) {
    try {
        const text = (msg as any)?.text || (typeof msg === 'string' && msg) || lc('loading');
        const indicator = getLoadingIndicator();
        indicator.instance.onButtonTap = msg?.['onButtonTap'];
        const props = {
            showButton: !!msg?.['onButtonTap'],
            text,
            title: (msg as any)?.title,
            progress: null
        };
        if (msg && typeof msg !== 'string' && msg?.hasOwnProperty('progress')) {
            props.progress = msg.progress;
        } else {
            props.progress = null;
        }
        indicator.instance.$set(props);
        if (showLoadingStartTime === null) {
            showLoadingStartTime = Date.now();
            indicator.show();
        }
    } catch (error) {
        showError(error, { silent: true });
    }
}
export function showingLoading() {
    return showLoadingStartTime !== null;
}
export async function hideLoading() {
    if (!loadingIndicator) {
        return;
    }
    const delta = showLoadingStartTime ? Date.now() - showLoadingStartTime : -1;
    if (__IOS__ && delta >= 0 && delta < 1000) {
        await timeout(1000 - delta);
        // setTimeout(() => hideLoading(), 1000 - delta);
        // return;
    }
    showLoadingStartTime = null;
    if (loadingIndicator) {
        loadingIndicator.hide();
    }
}

export async function importAndScanImageOrPdfFromUris(uris: string[], document?: OCRDocument, canGoToView = true) {
    // TODO: should check import as a document or qrcode
    let pagesToAdd: PageData[] = [];
    let items: ImportImageData[] = [];
    try {
        await showLoading(l('computing'));
        const noDetectionMargin = ApplicationSettings.getNumber('documentNotDetectedMargin', DOCUMENT_NOT_DETECTED_MARGIN);
        const previewResizeThreshold = ApplicationSettings.getNumber('previewResizeThreshold', PREVIEW_RESIZE_THRESHOLD);
        const areaScaleMinFactor = ApplicationSettings.getNumber('areaScaleMinFactor', AREA_SCALE_MIN_FACTOR);
        const resizeThreshold = previewResizeThreshold * 1.5;
        const cropEnabled = ApplicationSettings.getBoolean(SETTINGS_CROP_ENABLED, CROP_ENABLED);

        const [pdf, images] = await uris.reduce(
            async (acc, e) => {
                let testStr = e.toLowerCase();
                if (__ANDROID__ && e.startsWith(ANDROID_CONTENT)) {
                    testStr = await getFileName(e);
                }
                acc.then((obj) => {
                    if (testStr.endsWith(PDF_EXT)) {
                        obj[0].push(e);
                    } else {
                        obj[1].push(e);
                    }
                });
                return acc;
                // return testStr.endsWith(PDF_EXT) ? [[...p, e], f] : [p, [...f, e]];
            },
            Promise.resolve([[], []] as [string[], string[]])
        );
        DEV_LOG && console.log('importAndScanImageOrPdfFromUris', pdf, images);

        // First we check/ask the user if he wants to import PDF pages or images
        let pdfImportsImages = ApplicationSettings.getString(SETTINGS_IMPORT_PDF_IMAGES, PDF_IMPORT_IMAGES) as PDFImportImages;
        if (pdf.length > 0 && pdfImportsImages === PDFImportImages.ask) {
            const options = new ObservableArray([
                { name: lc('pdf_one_image_per_page'), data: PDFImportImages.never, type: 'checkbox', boxType: 'circle', value: true },
                { name: lc('pdf_one_image_per_pdf_image'), data: PDFImportImages.always, type: 'checkbox', boxType: 'circle', value: false }
            ]);
            // const component = (await import('~/components/common/OptionSelect.svelte')).default;
            const result = await showConfirmOptionSelect<PDFImportImages>(
                {
                    height: Math.min(options.length * 100, 400),
                    autoSizeListItem: true,
                    onlyOneSelected: true,
                    fontWeight: 'normal',
                    selectedIndex: 0,
                    options
                },
                {
                    title: lc('import_pdf_images'),
                    message: lc('import_pdf_images_desc'),
                    okButtonText: lc('always'),
                    cancelButtonText: lc('just_once'),
                    iosForceClosePresentedViewController: true // force close current loading dialog, we ll show it again after
                }
            );
            pdfImportsImages = result.data;
            if (result.confirmed) {
                ApplicationSettings.setString(SETTINGS_IMPORT_PDF_IMAGES, pdfImportsImages);
            }
            if (__IOS__) {
                //we forced close current loading dialog,let s show it again after
                await showLoading(l('computing'));
            }
            DEV_LOG && console.log('showPromptOptionSelect', result);
        }
        const imageExportSettings = getImageExportSettings();

        // now we process PDF files
        // We do it in batch of 5 to prevent memory issues
        const pdfImages = await doInBatch(
            pdf,
            (pdfPath: string) =>
                new Promise<string[]>(async (resolve, reject) => {
                    try {
                        const start = Date.now();
                        DEV_LOG && console.log('importFromPdf', pdfPath, Date.now() - start, 'ms');
                        const pdfImages = await importPdfToTempImages(pdfPath, {
                            importPDFImages: pdfImportsImages === PDFImportImages.always,
                            compressFormat: imageExportSettings.imageFormat,
                            compressQuality: imageExportSettings.imageQuality
                        });
                        DEV_LOG && console.log('importFromPdf done ', pdfPath, pdfImages, Date.now() - start, 'ms');
                        resolve(pdfImages);
                    } catch (error) {
                        reject(error);
                    }
                })
        );

        // now we process all image files
        // We do it in batch of 5 to prevent memory issues
        items = await doInBatch(
            images.concat(pdfImages.flat()),
            (sourceImagePath: string) =>
                new Promise<ImportImageData>(async (resolve, reject) => {
                    try {
                        const start = Date.now();
                        const imageSize = await getImageSize(sourceImagePath);
                        DEV_LOG && console.log('importFromImage', sourceImagePath, JSON.stringify(imageSize), Date.now() - start, 'ms');

                        const imageRotation = imageSize.rotation;
                        // TODO: detect JSON and QRCode in one go
                        DEV_LOG && console.log('[importAndScanImageFromUris] getJSONDocumentCornersFromFile', sourceImagePath, resizeThreshold);
                        const quads = cropEnabled ? await getJSONDocumentCornersFromFile(sourceImagePath, { resizeThreshold, areaScaleMinFactor }) : undefined;
                        let qrcode;
                        if (document.isQRCodeOnly) {
                            // try to get the qrcode to show it in the import screen
                            qrcode = await detectQRCodeFromFile(sourceImagePath, { resizeThreshold: QRCODE_RESIZE_THRESHOLD });
                        }
                        if (cropEnabled && quads.length === 0) {
                            let width = imageSize.width;
                            let height = imageSize.height;
                            if (imageRotation % 180 !== 0) {
                                width = imageSize.height;
                                height = imageSize.width;
                            }
                            quads.push([
                                [noDetectionMargin, noDetectionMargin],
                                [width - noDetectionMargin, noDetectionMargin],
                                [width - noDetectionMargin, height - noDetectionMargin],
                                [noDetectionMargin, height - noDetectionMargin]
                            ]);
                        }
                        DEV_LOG && console.log('importFromImage done', sourceImagePath, Date.now() - start, 'ms');
                        resolve({ quads, imagePath: sourceImagePath, qrcode, imageWidth: imageSize.width, imageHeight: imageSize.height, imageRotation, undos: [], redos: [] });
                    } catch (error) {
                        reject(error);
                    }
                })
        );

        DEV_LOG &&
            console.log(
                'items',
                items.map((i) => i.imagePath)
            );
        // const sourceImagePath = selection[0].path;
        // editingImage = await loadImage(sourceImagePath);

        // if (!editingImage) {
        //     throw new Error('failed to read imported image');
        // }
        // let quads = await getJSONDocumentCorners(editingImage, 300, 0);
        // let qrcode;
        // if (CARD_APP) {
        //     // try to get the qrcode to show it in the import screen
        //     qrcode = await detectQRCode(editingImage, { resizeThreshold: 900 });
        // }
        // if (quads.length === 0) {
        //     quads.push([
        //         [100, 100],
        //         [editingImage.width - 100, 100],
        //         [editingImage.width - 100, editingImage.height - 100],
        //         [100, editingImage.height - 100]
        //     ]);
        // }
        if (items?.length) {
            if (cropEnabled) {
                const ModalImportImage = (await import('~/components/ModalImportImages.svelte')).default;
                const newItems: ImportImageData[] = await showModal({
                    page: ModalImportImage,
                    animated: true,
                    fullscreen: true,
                    props: {
                        items
                    }
                });
                if (!newItems) {
                    return;
                }
            }
            if (items) {
                DEV_LOG &&
                    console.log(
                        'items after crop',
                        items.map((i) => i.imagePath)
                    );
                pagesToAdd = (
                    await doInBatch(
                        items,
                        (item, index) =>
                            new Promise<PageData[]>(async (resolve, reject) => {
                                try {
                                    const start = Date.now();
                                    DEV_LOG && console.log('about to cropDocument', index, JSON.stringify(item));
                                    const images: CropResult[] = [];
                                    if (item.quads) {
                                        images.push(
                                            ...(await cropDocumentFromFile(item.imagePath, item.quads, {
                                                // rotation: item.imageRotation,
                                                fileName: `cropedBitmap_${index}.${IMG_FORMAT}`,
                                                saveInFolder: knownFolders.temp().path,
                                                compressFormat: imageExportSettings.imageFormat,
                                                compressQuality: imageExportSettings.imageQuality
                                            }))
                                        );
                                        // we generate
                                    } else {
                                        images.push({ imagePath: item.imagePath, width: item.imageWidth, height: item.imageHeight });
                                    }

                                    const result = [];
                                    DEV_LOG &&
                                        console.log(
                                            'images',
                                            images.map((i) => i.imagePath)
                                        );
                                    if (images?.length) {
                                        for (let index = 0; index < images.length; index++) {
                                            const image = images[index];
                                            let qrcode;
                                            let colors;
                                            if (document.isQRCodeOnly) {
                                                [qrcode, colors] = await processFromFile(
                                                    image.imagePath,
                                                    [
                                                        {
                                                            type: 'qrcode'
                                                        },
                                                        {
                                                            type: 'palette',
                                                            shrunkImageHeight: COLOR_PALETTE_RESIZE_THRESHOLD,
                                                            colorsFilterDistanceThreshold: 20,
                                                            nbColors: 5,
                                                            colorPalette: 2
                                                        }
                                                    ],
                                                    {
                                                        maxSize: QRCODE_RESIZE_THRESHOLD
                                                    }
                                                );
                                                DEV_LOG && console.log('qrcode and colors', qrcode, colors);
                                            }
                                            result.push({
                                                ...image,
                                                crop: item.quads?.[index] || [
                                                    [0, 0],
                                                    [item.imageWidth - 0, 0],
                                                    [item.imageWidth - 0, item.imageHeight - 0],
                                                    [0, item.imageHeight - 0]
                                                ],
                                                sourceImagePath: item.imagePath,
                                                sourceImageWidth: item.imageWidth,
                                                sourceImageHeight: item.imageHeight,
                                                sourceImageRotation: item.imageRotation,
                                                // rotation: item.imageRotation,
                                                qrcode,
                                                colors
                                            });
                                        }
                                    }
                                    DEV_LOG && console.log('cropAndOtherDone', index, Date.now() - start, 'ms');
                                    resolve(result);
                                } catch (error) {
                                    reject(error);
                                }
                            })
                    )
                ).flat();
                DEV_LOG && console.log('pagesToAdd', document?.id, JSON.stringify(pagesToAdd));
                if (pagesToAdd.length) {
                    const nbPagesBefore = document?.pages.length ?? 0;
                    if (document) {
                        await document.addPages(pagesToAdd);
                        await document.save({}, true);
                        showSnack({ message: lc('imported_nb_pages', pagesToAdd.length) });
                    } else {
                        document = await OCRDocument.createDocument(pagesToAdd);
                    }
                    await goToDocumentAfterScan(document, nbPagesBefore, canGoToView);
                    return document;
                }
            }
        }
        showSnack({ message: lc('no_document_found') });
    } catch (error) {
        throw error;
    } finally {
        hideLoading();
    }
}
export async function importAndScanImage(document?: OCRDocument, importPDFs = false, canGoToView = true) {
    await request({ storage: {}, photo: {} });
    // let selection: { files: string[]; ios?; android? };
    // let editingImage: ImageSource;
    try {
        if (__ANDROID__) {
            // on android a background event will trigger while picking a file
            securityService.ignoreNextValidation();
        }
        let selection: string[];
        if (__IOS__ && !importPDFs) {
            try {
                const data = await createImagePicker({
                    mediaType: 1,
                    mode: 'multiple' // use "multiple" for multiple selection
                }).present();
                selection = data.map((d) => d.path);
            } catch (error) {
                selection = null;
            }

            // we need to wait a bit or the presenting controller
            // is still the image picker and will mix things up
            // if (__IOS__) {
            //     await timeout(500);
            // }
        } else {
            selection = (
                await openFilePicker({
                    mimeTypes: ['image/*', 'application/pdf'],
                    documentTypes: __IOS__ ? [UTTypeImage.identifier, UTTypePDF.identifier] : undefined,
                    multipleSelection: true,
                    pickerMode: 0,
                    forceSAF: true
                })
            )?.files // not sure why we need to add file:// to pdf files on android < 12 but we get an error otherwise
                .map((s) => (__ANDROID__ && !s.startsWith('file://') && !s.startsWith(ANDROID_CONTENT) && s.endsWith(PDF_EXT) ? 'file://' + s : s));
        }

        // }
        DEV_LOG && console.log('selection', selection);
        if (selection?.length > 0) {
            return await importAndScanImageOrPdfFromUris(selection, document, canGoToView);
        }
    } catch (error) {
        throw error;
    } finally {
        hideLoading();
    }
}

export async function showAlertOptionSelect(props?: ComponentProps<OptionSelect__SvelteComponent_>, options?: Partial<AlertOptions & MDCAlertControlerOptions>) {
    const component = (await import('~/components/common/OptionSelect.svelte')).default;
    let componentInstanceInfo: ComponentInstanceInfo<GridLayout, OptionSelect__SvelteComponent_>;
    try {
        componentInstanceInfo = resolveComponentElement(component, {
            onClose: (result) => {
                view.bindingContext.closeCallback(result);
            },
            onCheckBox(item, value, e) {
                view.bindingContext.closeCallback(item);
            },
            trackingScrollView: 'collectionView',
            ...props
        }) as ComponentInstanceInfo<GridLayout, OptionSelect__SvelteComponent_>;
        const view: View = componentInstanceInfo.element.nativeView;
        const result = await alert({
            view,
            okButtonText: lc('cancel'),
            ...(options ? options : {})
        });
        return result;
    } catch (err) {
        throw err;
    } finally {
        componentInstanceInfo.element.nativeElement._tearDownUI();
        componentInstanceInfo.viewInstance.$destroy();
        componentInstanceInfo = null;
    }
}
export async function showConfirmOptionSelect<T>(props?: ComponentProps<OptionSelect__SvelteComponent_>, options?: Partial<ConfirmOptions & MDCAlertControlerOptions>) {
    const component = (await import('~/components/common/OptionSelect.svelte')).default;
    let componentInstanceInfo: ComponentInstanceInfo<GridLayout, OptionSelect__SvelteComponent_>;
    try {
        componentInstanceInfo = resolveComponentElement(component, {
            onClose: (result) => {
                view.bindingContext.closeCallback(result);
            },
            // onCheckBox(item, value, e) {
            // view.bindingContext.closeCallback(item);
            // },
            trackingScrollView: 'collectionView',
            ...props
        }) as ComponentInstanceInfo<GridLayout, OptionSelect__SvelteComponent_>;
        const view: View = componentInstanceInfo.element.nativeView;
        const result = await confirm({
            view,
            okButtonText: lc('ok'),
            cancelButtonText: lc('cancel'),
            ...(options ? options : {})
        });
        return { confirmed: result, data: componentInstanceInfo.viewInstance.currentlyCheckedItem.data as T };
    } catch (err) {
        throw err;
    } finally {
        componentInstanceInfo.element.nativeElement._tearDownUI();
        componentInstanceInfo.viewInstance.$destroy();
        componentInstanceInfo = null;
    }
}

export async function showPopoverMenu<T = any>({
    options,
    anchor,
    onClose,
    props,
    horizPos,
    vertPos,
    closeOnClose = true
}: { options; anchor; onClose?; props?; closeOnClose? } & Partial<PopoverOptions>) {
    const { colorSurfaceContainer } = get(colors);
    const OptionSelect = (await import('~/components/common/OptionSelect.svelte')).default;
    const rowHeight = (props?.rowHeight || 58) * get(fontScale);
    const result: T = await showPopover({
        backgroundColor: colorSurfaceContainer,
        view: OptionSelect,
        anchor,
        horizPos: horizPos ?? HorizontalPosition.ALIGN_LEFT,
        vertPos: vertPos ?? VerticalPosition.CENTER,
        props: {
            borderRadius: 10,
            elevation: __ANDROID__ ? 3 : 0,
            margin: 4,
            fontWeight: 500,
            backgroundColor: colorSurfaceContainer,
            containerColumns: 'auto',
            rowHeight: !!props?.autoSizeListItem ? null : rowHeight,
            height: Math.min(rowHeight * options.length, props?.maxHeight || 400),
            width: 200 * get(fontScale),
            options,
            onClose: async (item) => {
                if (closeOnClose) {
                    if (__IOS__) {
                        // on iOS we need to wait or if onClose shows an alert dialog it wont work
                        await closePopover();
                    } else {
                        closePopover();
                    }
                }
                try {
                    await onClose?.(item);
                } catch (error) {
                    showError(error);
                } finally {
                    hideLoading();
                }
            },
            ...(props || {})
        }
    });
    return result;
}

export async function showSettings(props?) {
    const Settings = (await import('~/components/settings/Settings.svelte')).default;
    navigate({
        page: Settings,
        props
    });
}

export async function showPDFPopoverMenu(pages: OCRPage[], document?: OCRDocument, anchor?) {
    let exportDirectory = ApplicationSettings.getString('pdf_export_directory', DEFAULT_EXPORT_DIRECTORY);
    let exportDirectoryName = exportDirectory;
    function updateDirectoryName() {
        exportDirectoryName = exportDirectory.split(/(\/|%3A)/).pop();
    }
    updateDirectoryName();

    const options = new ObservableArray(
        (__ANDROID__ ? [{ id: 'set_export_directory', name: lc('export_folder'), subtitle: exportDirectoryName, rightIcon: 'mdi-restore' }] : [])
            .concat([
                { id: 'settings', name: lc('pdf_export_settings'), icon: 'mdi-cog' },
                { id: 'open', name: lc('open'), icon: 'mdi-eye' },
                { id: 'share', name: lc('share'), icon: 'mdi-share-variant' },
                { id: 'export', name: lc('export'), icon: 'mdi-export' }
            ] as any)
            .concat(__ANDROID__ ? ([{ id: 'print', name: lc('print'), icon: 'mdi-printer' }] as any) : [])
            .concat([{ id: 'preview', name: lc('preview'), icon: 'mdi-printer-eye' }] as any)
    );
    return showPopoverMenu({
        options,
        anchor,
        vertPos: VerticalPosition.BELOW,
        props: {
            width: 250,
            // rows: 'auto',
            // rowHeight: null,
            // height: null,
            // autoSizeListItem: true,
            onRightIconTap: (item, event) => {
                try {
                    switch (item.id) {
                        case 'set_export_directory': {
                            ApplicationSettings.remove('pdf_export_directory');
                            exportDirectory = DEFAULT_EXPORT_DIRECTORY;
                            updateDirectoryName();
                            const item = options.getItem(0);
                            item.subtitle = exportDirectoryName;
                            options.setItem(0, item);
                            break;
                        }
                    }
                } catch (error) {
                    showError(error);
                }
            }
        },

        closeOnClose: false,
        onClose: async (item) => {
            try {
                DEV_LOG && console.log('showPDFPopoverMenu', 'action', item.id);
                switch (item.id) {
                    case 'settings': {
                        closePopover();
                        showSettings({
                            subSettingsOptions: 'pdf'
                        });
                        break;
                    }
                    case 'set_export_directory': {
                        const result = await pickFolder({
                            multipleSelection: false,
                            permissions: { write: true, persistable: true, read: true },
                            forceSAF: true
                        });
                        if (result.folders.length) {
                            exportDirectory = result.folders[0];
                            DEV_LOG && console.log('set_export_directory', exportDirectory);
                            ApplicationSettings.setString('pdf_export_directory', exportDirectory);
                            updateDirectoryName();
                            const item = options.getItem(0);
                            item.subtitle = exportDirectoryName;
                            options.setItem(0, item);
                        }
                        break;
                    }
                    case 'print': {
                        await closePopover();
                        await showLoading(l('exporting'));
                        const filePath = await exportPDFAsync({ pages, document });
                        hideLoading();
                        DEV_LOG && console.log('print pdf', filePath);
                        printPDF(filePath, document?.name || 'PDF');
                        break;
                    }
                    case 'open': {
                        await closePopover();
                        await showLoading(l('exporting'));
                        const filePath = await exportPDFAsync({ pages, document });
                        hideLoading();
                        DEV_LOG && console.log('opening pdf', filePath);
                        openFile(filePath);
                        break;
                    }
                    case 'share': {
                        await closePopover();
                        await showLoading(l('exporting'));
                        const filePath = await exportPDFAsync({ pages, document });
                        hideLoading();
                        DEV_LOG && console.log('sharing pdf', filePath);
                        share({ file: filePath }, { mimetype: 'application/pdf' });
                        break;
                    }
                    case 'export': {
                        await closePopover();
                        const result = await prompt({
                            okButtonText: lc('ok'),
                            cancelButtonText: lc('cancel'),
                            defaultText: getFileNameForDocument(document) + PDF_EXT,
                            hintText: lc('pdf_filename')
                        });
                        if (result?.result && result?.text?.length) {
                            showLoading(l('exporting'));
                            DEV_LOG && console.log('exportPDF', exportDirectory, result.text);
                            const filePath = await exportPDFAsync({ pages, document, folder: exportDirectory, filename: result.text });
                            hideLoading();
                            DEV_LOG && console.log('exportPDF done', filePath, File.exists(filePath));
                            let filename;
                            if (__ANDROID__ && filePath.startsWith(ANDROID_CONTENT)) {
                                filename = com.nativescript.documentpicker.FilePath.getPath(Utils.android.getApplicationContext(), android.net.Uri.parse(filePath)).split(SEPARATOR).pop();
                            } else {
                                filename = filePath.split(SEPARATOR).pop();
                            }
                            const onSnack = await showSnack({ message: lc('pdf_saved', filename), actionText: lc('open') });
                            if (onSnack?.reason === 'action') {
                                DEV_LOG && console.log('openFile', filePath);
                                openFile(filePath);
                            }
                        }
                        break;
                    }
                    case 'preview':
                        await closePopover();
                        const component = (await import('~/components/pdf/PDFPreview.svelte')).default;
                        await showModal({
                            page: component,
                            animated: true,
                            fullscreen: true,
                            props: {
                                pages,
                                document
                            }
                        });
                        break;
                }
            } catch (error) {
                showError(error);
            } finally {
                hideLoading();
            }
        }
    });
}

async function exportImages(pages: OCRPage[], exportDirectory: string, toGallery = false) {
    const sortedPages = pages.sort((a, b) => a.createdDate - b.createdDate);
    const imagePaths = sortedPages.map((page) => page.imagePath);

    const imageExportSettings = getImageExportSettings();
    const canSetName = !toGallery && imagePaths.length === 1;
    let outputImageNames = [];
    if (canSetName) {
        const result = await prompt({
            okButtonText: lc('ok'),
            cancelButtonText: lc('cancel'),
            defaultText: getFileNameForDocument() + '.' + imageExportSettings.imageFormat,
            hintText: lc('image_filename'),
            view: createView(Label, {
                padding: '10 20 0 20',
                textWrap: true,
                color: get(colors).colorOnSurfaceVariant as any,
                html: lc('set_filename_format_settings')
            })
        });
        if (!result?.result || !result?.text?.length) {
            return;
        }
        outputImageNames.push(result.text);
    } else {
        outputImageNames = sortedPages.map((page) => (page.name ? cleanFilename(page.name) : getFormatedDateForFilename(page.createdDate)));
        // find duplicates and rename if any
        let lastName;
        let renameDelta = 1;
        for (let index = 0; index < outputImageNames.length; index++) {
            const name = outputImageNames[index];
            if (name === lastName) {
                outputImageNames[index] = name + '_' + (renameDelta++ + '').padStart(3, '0');
                // we dont reset lastName so that we compare to the first one found
            } else {
                lastName = name;
                renameDelta = 1;
            }
        }
    }
    DEV_LOG && console.log('exporting images', imageExportSettings.imageFormat, imageExportSettings.imageQuality, exportDirectory, outputImageNames);
    showLoading(l('exporting'));
    // const destinationPaths = [];
    let finalMessagePart;
    await doInBatch(
        sortedPages,
        (page, index) =>
            new Promise<void>(async (resolve, reject) => {
                let imageSource: ImageSource;
                try {
                    const fileName = outputImageNames[index];
                    let destinationName = fileName;
                    if (!destinationName.endsWith(imageExportSettings.imageFormat)) {
                        destinationName += '.' + imageExportSettings.imageFormat;
                    }
                    // const imageSource = await ImageSource.fromFile(imagePath);
                    imageSource = await getTransformedImage(page);

                    finalMessagePart = await saveImage(imageSource, {
                        exportDirectory,
                        fileName,
                        toGallery,
                        ...imageExportSettings,
                        reportName: canSetName
                    });
                    // if (__ANDROID__ && toGallery) {
                    //     await request('storage');
                    //     com.akylas.documentscanner.utils.ImageUtil.Companion.saveBitmapToGallery(
                    //         Utils.android.getApplicationContext(),
                    //         imageSource.android,
                    //         imageExportSettings.imageFormat,
                    //         imageExportSettings.imageQuality,
                    //         fileName
                    //     );
                    // } else if (__ANDROID__ && exportDirectory.startsWith(ANDROID_CONTENT)) {
                    //     const context = Utils.android.getApplicationContext();
                    //     const outdocument = androidx.documentfile.provider.DocumentFile.fromTreeUri(context, android.net.Uri.parse(exportDirectory));
                    //     let outfile = outdocument.createFile('image/jpeg', destinationName);
                    //     if (outfile == null) {
                    //         outfile = outdocument.findFile(destinationName);
                    //     }
                    //     if (!outfile) {
                    //         throw new Error(`error creating file "${destinationName}" in "${exportDirectory}"`);
                    //     }
                    //     if (!finalMessagePart) {
                    //         if (canSetName) {
                    //             finalMessagePart = com.nativescript.documentpicker.FilePath.getPath(context, outfile.getUri());
                    //         } else {
                    //             finalMessagePart = com.nativescript.documentpicker.FilePath.getPath(context, outdocument.getUri());
                    //         }
                    //         DEV_LOG && console.log('finalMessagePart', finalMessagePart);
                    //     }
                    //     const stream = Utils.android.getApplicationContext().getContentResolver().openOutputStream(outfile.getUri());
                    //     (imageSource.android as android.graphics.Bitmap).compress(
                    //         imageExportSettings.imageFormat === 'png' ? android.graphics.Bitmap.CompressFormat.PNG : android.graphics.Bitmap.CompressFormat.JPEG,
                    //         imageExportSettings.imageQuality,
                    //         stream
                    //     );
                    //     // destinationPaths.push(outfile.getUri().toString());
                    // } else {
                    //     const destinationPath = path.join(exportDirectory, destinationName);
                    //     await imageSource.saveToFileAsync(destinationPath, imageExportSettings.imageFormat, imageExportSettings.imageQuality);
                    //     // destinationPaths.push(destinationPath);
                    //     if (!finalMessagePart) {
                    //         if (canSetName) {
                    //             finalMessagePart = destinationPath;
                    //         } else {
                    //             finalMessagePart = exportDirectory;
                    //         }
                    //     }
                    // }
                    resolve();
                } catch (error) {
                    if (/error creating file/.test(error.toString())) {
                        reject(new SilentError(lc('please_choose_export_folder_again')));
                    } else {
                        reject(error);
                    }
                } finally {
                    recycleImages(imageSource);
                }
            })
    );
    if (outputImageNames.length === 1) {
        showSnack({ message: lc('image_saved', finalMessagePart) });
    } else {
        showSnack({ message: lc('images_saved', finalMessagePart) });
    }
}

export function getDirectoryName(folderPath: string) {
    let exportDirectoryName = folderPath;
    if (__ANDROID__ && folderPath.startsWith(ANDROID_CONTENT)) {
        const context = Utils.android.getApplicationContext();
        const outdocument = androidx.documentfile.provider.DocumentFile.fromTreeUri(context, android.net.Uri.parse(folderPath));
        exportDirectoryName = com.nativescript.documentpicker.FilePath.getPath(Utils.android.getApplicationContext(), outdocument.getUri());
    }
    return exportDirectoryName
        .split(SEPARATOR)
        .filter((s) => s.length)
        .pop();
}

export async function showImagePopoverMenu(pages: OCRPage[], anchor, vertPos = VerticalPosition.BELOW) {
    let exportDirectory = ApplicationSettings.getString('image_export_directory', DEFAULT_EXPORT_DIRECTORY);
    let exportDirectoryName = exportDirectory;
    DEV_LOG && console.log('showImagePopoverMenu', exportDirectoryName, exportDirectory.split(/(\/|%3A)/));
    function updateDirectoryName() {
        exportDirectoryName = getDirectoryName(exportDirectory);
    }
    updateDirectoryName();

    const options = new ObservableArray(
        (__ANDROID__ ? [{ id: 'set_export_directory', name: lc('export_folder'), subtitle: exportDirectoryName, rightIcon: 'mdi-restore' }] : []).concat([
            { id: 'export', name: lc('export'), icon: 'mdi-export', subtitle: undefined },
            { id: 'save_gallery', name: lc('save_gallery'), icon: 'mdi-image-multiple', subtitle: undefined },
            { id: 'share', name: lc('share'), icon: 'mdi-share-variant' }
        ] as any)
    );
    return showPopoverMenu({
        options,
        anchor,
        vertPos,
        props: {
            width: 250,
            // rows: 'auto',
            // rowHeight: null,
            // height: null,
            // autoSizeListItem: true,
            onRightIconTap: (item, event) => {
                try {
                    switch (item.id) {
                        case 'set_export_directory': {
                            ApplicationSettings.remove('image_export_directory');
                            exportDirectory = DEFAULT_EXPORT_DIRECTORY;
                            updateDirectoryName();
                            const item = options.getItem(0);
                            item.subtitle = exportDirectoryName;
                            options.setItem(0, item);
                            break;
                        }
                    }
                } catch (error) {
                    showError(error);
                }
            }
        },

        closeOnClose: false,
        onClose: async (item) => {
            try {
                switch (item.id) {
                    case 'set_export_directory': {
                        const result = await pickFolder({
                            multipleSelection: false,
                            permissions: { write: true, persistable: true, read: true }
                        });
                        if (result.folders.length) {
                            exportDirectory = result.folders[0];
                            ApplicationSettings.setString('image_export_directory', exportDirectory);
                            updateDirectoryName();
                            const item = options.getItem(0);
                            item.subtitle = exportDirectoryName;
                            options.setItem(0, item);
                        }
                        break;
                    }
                    case 'share':
                        await closePopover();
                        const images = [];
                        const files = [];
                        try {
                            for (let index = 0; index < pages.length; index++) {
                                const page = pages[index];
                                if (page.colorMatrix) {
                                    const imageSource = await getTransformedImage(page);
                                    images.push(imageSource);
                                } else {
                                    files.push(page.imagePath);
                                }
                            }
                            await share({ images, files });
                        } catch (error) {
                            throw error;
                        } finally {
                            recycleImages(images);
                        }
                        break;
                    case 'export': {
                        await closePopover();
                        await exportImages(pages, exportDirectory);
                        break;
                    }
                    case 'save_gallery': {
                        await closePopover();
                        await exportImages(pages, exportDirectory, true);
                        break;
                    }
                }
            } catch (error) {
                showError(error);
            } finally {
                hideLoading();
            }
        }
    });
}

export interface ShowSnackMessageOptions {
    text: string;
    progress?: number;
    translateY?: number;
}
let snackMessage: ComponentInstanceInfo<GridLayout, BottomSnack__SvelteComponent_>;
function getSnackMessage(props?) {
    if (!snackMessage) {
        snackMessage = resolveComponentElement(BottomSnack, props || {}) as ComponentInstanceInfo<GridLayout, BottomSnack__SvelteComponent_>;
        try {
            (Application.getRootView() as GridLayout).addChild(snackMessage.element.nativeView);
        } catch (error) {
            console.error(error, error.stack);
        }
    }
    return snackMessage;
}
export function updateSnackMessage(msg: Partial<ShowSnackMessageOptions>) {
    if (snackMessage) {
        const snackMessage = getSnackMessage();
        const props = {
            progress: msg.progress
        };
        if (msg.text) {
            props['text'] = msg.text;
        }
        snackMessage.viewInstance.$set(props);
    }
}
export async function showSnackMessage(props: ShowSnackMessageOptions) {
    if (snackMessage) {
        updateSnackMessage(props);
    } else {
        const snackMessage = getSnackMessage(props);
        const animationArgs = [
            {
                target: snackMessage.element.nativeView,
                translate: { x: 0, y: 0 },
                duration: 100
            }
        ];
        Application.notify({ eventName: 'snackMessageAnimation', animationArgs });
        await new Animation(animationArgs).play();
        updateSnackMessage({ translateY: 0 });
    }
}
export async function hideSnackMessage() {
    if (snackMessage) {
        const animationArgs: AnimationDefinition[] = [
            {
                target: snackMessage.element.nativeView,
                translate: { x: 0, y: 100 },
                duration: 100
            }
        ];
        Application.notify({ eventName: 'snackMessageAnimation', animationArgs });
        await new Animation(animationArgs).play();
        (Application.getRootView() as GridLayout).removeChild(snackMessage.element.nativeView);
        snackMessage.element.nativeElement._tearDownUI();
        snackMessage.viewInstance.$destroy();
        snackMessage = null;
    }
}

export async function detectOCROnPage(document: OCRDocument, index: number) {
    try {
        if (!(await ocrService.checkOrDownload(ocrService.dataType, ocrService.languages, false))) {
            return;
        }
        showLoading({ text: l('ocr_computing', 0), progress: 0 });
        const ocrData = await ocrService.ocrPage(document, index, (progress: number) => {
            updateLoadingProgress({ progress, text: l('ocr_computing', progress) });
        });
        return ocrData;
    } catch (err) {
        throw err;
    } finally {
        hideLoading();
        // recycleImages(ocrImage);
    }
}
interface PageTransformData {
    page: OCRPage;
    pageIndex: number;
    document: OCRDocument;
}
export async function transformPages({ documents, pages }: { documents?: OCRDocument[]; pages?: PageTransformData[] }) {
    try {
        const view = (await import('~/components/common/TransformPagesBottomSheet.svelte')).default;
        const updateOptions = await showBottomSheet({
            view,
            skipCollapsedState: true
        });
        if (updateOptions) {
            // await showLoading(l('computing'));

            // we want to ocr the full document.
            const progress = 0;
            if (!pages && documents) {
                pages = [];
                documents.forEach((document) => {
                    pages.push(...document.pages.reduce((acc, page, pageIndex) => acc.concat([{ page, pageIndex, document }]), []));
                });
            }
            const totalPages = pages.length;
            let pagesDone = 0;
            showSnackMessage({
                text: lc('updating_pages', progress),
                progress: 0
            });
            await doInBatch(pages, async (p: PageTransformData, index) => {
                await p.document.updatePageTransforms(p.pageIndex, updateOptions.transforms.join(TRANSFORMS_SPLIT), {
                    colorType: updateOptions.colorType,
                    colorMatrix: updateOptions.colorMatrix
                });

                pagesDone += 1;
                const progress = Math.round((pagesDone / totalPages) * 100);
                updateSnackMessage({
                    text: lc('updating_pages', progress),
                    progress
                });
            });
        }
    } catch (error) {
        throw error;
    } finally {
        hideSnackMessage();
    }
}
export async function detectOCR({ documents, pages }: { documents?: OCRDocument[]; pages?: { page: OCRPage; pageIndex: number; document: OCRDocument }[] }) {
    try {
        const OCRSettingsBottomSheet = (await import('~/components/ocr/OCRSettingsBottomSheet.svelte')).default;
        const shouldStart = await showBottomSheet({
            view: OCRSettingsBottomSheet,
            skipCollapsedState: true,
            props: {}
        });
        if (shouldStart) {
            if (!(await ocrService.checkOrDownload(ocrService.dataType, ocrService.languages, false, true))) {
                return;
            }

            // we want to ocr the full document.
            const progress = 0;
            if (!pages && documents) {
                pages = [];
                documents.forEach((document) => {
                    pages.push(...document.pages.reduce((acc, page, pageIndex) => acc.concat([{ page, pageIndex, document }]), []));
                });
            }
            const totalPages = pages.length;
            let pagesDone = 0;
            showSnackMessage({
                text: lc('ocr_computing_document', progress),
                progress: 0
            });
            const runnningOcr: { [k: string]: number } = {};
            await Promise.all(
                pages.map(async (p, index) => {
                    const pageId = p.page.id;
                    runnningOcr[pageId] = 0;
                    await ocrService.ocrPage(p.document, p.pageIndex, (progress: number) => {
                        runnningOcr[pageId] = progress;
                        const totalProgress = Math.round((100 / totalPages) * pagesDone + Object.values(runnningOcr).reduce((a, b) => a + b) / totalPages);
                        updateSnackMessage({
                            text: lc('ocr_computing_document', totalProgress),
                            progress: totalProgress
                        });
                    });
                    delete runnningOcr[pageId];
                    pagesDone += 1;
                })
            );
        }
    } catch (error) {
        throw error;
    } finally {
        hideSnackMessage();
    }
}

export function copyTextToClipboard(text) {
    copyToClipboard(text);
    if (__IOS__ || (__ANDROID__ && SDK_VERSION < 13)) {
        showToast(lc('copied'));
    }
}

export async function showSliderPopover({
    debounceDuration = 100,
    min = 0,
    max = 100,
    step = 1,
    horizPos = HorizontalPosition.ALIGN_LEFT,
    anchor,
    vertPos = VerticalPosition.CENTER,
    width = 0.8 * screenWidthDips,
    value,
    onChange,
    title,
    icon,
    formatter
}: {
    title?;
    debounceDuration?;
    icon?;
    min?;
    max?;
    step?;
    formatter?;
    horizPos?;
    anchor;
    vertPos?;
    width?;
    value?;
    onChange?;
}) {
    const component = (await import('~/components/common/SliderPopover.svelte')).default;
    const { colorSurfaceContainer } = get(colors);

    return showPopover({
        backgroundColor: colorSurfaceContainer,
        view: component,
        anchor,
        horizPos,
        vertPos,
        props: {
            title,
            icon,
            min,
            max,
            step,
            width,
            formatter,
            value,
            onChange: debounce(onChange, debounceDuration)
        }

        // trackingScrollView: 'collectionView'
    });
}
export async function showSlidersPopover({
    debounceDuration = 100,
    horizPos = HorizontalPosition.ALIGN_LEFT,
    anchor,
    vertPos = VerticalPosition.CENTER,
    width = 0.8 * screenWidthDips,
    items
}: {
    debounceDuration?;
    horizPos?;
    anchor;
    vertPos?;
    width?;
    items;
}) {
    const component = (await import('~/components/common/SlidersPopover.svelte')).default;
    const { colorSurfaceContainer } = get(colors);

    return showPopover({
        backgroundColor: colorSurfaceContainer,
        view: component,
        anchor,
        horizPos,
        vertPos,
        props: {
            width,
            items
        }

        // trackingScrollView: 'collectionView'
    });
}

export async function showMatrixLevelPopover({ item, anchor, currentValue, onChange }) {
    if (!item.range) {
        return;
    }

    return showSliderPopover({
        vertPos: VerticalPosition.ABOVE,
        min: 0.5,
        max: 2,
        step: 0.1,
        anchor,
        value: currentValue,
        onChange
    });
}
export async function goToDocumentView(doc: OCRDocument, useTransition = true) {
    if (doc.isQRCodeOnly) {
        const page = (await import('~/components/view/CardView.svelte')).default;
        return navigate({
            page,
            props: {
                document: doc
            }
        });
    } else {
        const page = (await import('~/components/view/DocumentView.svelte')).default;
        return navigate({
            page,
            transition: __ANDROID__ && useTransition ? SharedTransition.custom(new PageTransition(300, null, 10)) : null,
            props: {
                document: doc
            }
        });
    }
}

export async function addCurrentImageToDocument({
    colorType,
    colorMatrix,
    pagesToAdd,
    sourceImagePath,
    imageWidth,
    imageHeight,
    imageRotation,
    quads,
    autoRotate,
    fileName,
    transforms = [],
    QRCodeOnly = false,
}: {
    colorType?;
    colorMatrix?;
    pagesToAdd;
    sourceImagePath;
    imageWidth;
    imageHeight;
    autoRotate?: boolean;
    imageRotation;
    quads;
    fileName?: string;
    transforms?: string[];
    QRCodeOnly: boolean;
}) {
    if (!sourceImagePath) {
        return;
    }
    const start = Date.now();
    const strTransforms = transforms?.join(TRANSFORMS_SPLIT) ?? '';
    DEV_LOG && console.log('addCurrentImageToDocument', sourceImagePath, quads);
    const images: CropResult[] = [];
    const compressFormat = ApplicationSettings.getString(SETTINGS_IMAGE_EXPORT_FORMAT, IMG_FORMAT) as 'png' | 'jpeg' | 'jpg';
    const compressQuality = ApplicationSettings.getNumber(SETTINGS_IMAGE_EXPORT_QUALITY, IMG_COMPRESS);
    if (quads) {
        images.push(
            ...(await cropDocumentFromFile(sourceImagePath, quads, {
                transforms: strTransforms,
                saveInFolder: knownFolders.temp().path,
                fileName,
                autoRotate,
                compressFormat,
                compressQuality
            }))
        );
        // we generate
    } else {
        images.push({ imagePath: sourceImagePath, width: imageWidth, height: imageHeight });
    }
    // let images = quads ? await cropDocumentFromFile(sourceImagePath, quads, strTransforms) : [sourceImagePath];
    if (images.length) {
        // if (!document) {
        //     document = await OCRDocument.createDocument();
        // }
        for (let index = 0; index < images.length; index++) {
            const image = images[index];
            let qrcode;
            let colors;
            if (QRCodeOnly) {
                [qrcode, colors] = await processFromFile(
                    image.imagePath,
                    [
                        {
                            type: 'qrcode'
                        },
                        {
                            type: 'palette',
                            shrunkImageHeight: COLOR_PALETTE_RESIZE_THRESHOLD,
                            colorsFilterDistanceThreshold: 20,
                            nbColors: 5,
                            colorPalette: 2
                        }
                    ],
                    {
                        resizeThreshold: QRCODE_RESIZE_THRESHOLD
                    }
                );
                // Promise.all([detectQRCode(images[0], { resizeThreshold: QRCODE_RESIZE_THRESHOLD }), getColorPalette(images[0])]);
                DEV_LOG && console.log('qrcode and colors', qrcode, colors);
            }
            pagesToAdd.push({
                ...image,
                crop: quads?.[index] || [
                    [0, 0],
                    [imageWidth - 0, 0],
                    [imageWidth - 0, imageHeight - 0],
                    [0, imageHeight - 0]
                ],
                colorType,
                colorMatrix,
                transforms: strTransforms,
                sourceImagePath,
                sourceImageWidth: imageWidth,
                sourceImageHeight: imageHeight,
                sourceImageRotation: imageRotation,
                rotation: 0, // cropped image is always rotated
                qrcode,
                colors
            });
        }
    }
    DEV_LOG && console.log('addCurrentImageToDocument done', sourceImagePath, Date.now() - start, 'ms');
}
export async function processCameraImage({
    imagePath,
    autoScan = false,
    onBeforeModalImport,
    onAfterModalImport,
    fileName,
    pagesToAdd,
    QRCodeOnly = false,
}: {
    imagePath: string;
    fileName?: string;
    autoScan?: boolean;
    onBeforeModalImport?: Function;
    onAfterModalImport?: Function;
    pagesToAdd;
    QRCodeOnly: boolean
}) {
    const previewResizeThreshold = ApplicationSettings.getNumber('previewResizeThreshold', PREVIEW_RESIZE_THRESHOLD);
    const areaScaleMinFactor = ApplicationSettings.getNumber('areaScaleMinFactor', AREA_SCALE_MIN_FACTOR);
    const noDetectionMargin = ApplicationSettings.getNumber('documentNotDetectedMargin', DOCUMENT_NOT_DETECTED_MARGIN);
    const cropEnabled = ApplicationSettings.getBoolean(SETTINGS_CROP_ENABLED, CROP_ENABLED);
    const colorType = ApplicationSettings.getString('defaultColorType', 'normal');
    const colorMatrix = JSON.parse(ApplicationSettings.getString('defaultColorMatrix', null));
    const transforms = ApplicationSettings.getString('defaultTransforms', '').split(TRANSFORMS_SPLIT);
    const alwaysPromptForCrop = ApplicationSettings.getBoolean(SETTINGS_ALWAYS_PROMPT_CROP_EDIT, ALWAYS_PROMPT_CROP_EDIT);
    let quads: Quads;
    const imageSize = await getImageSize(imagePath);
    const imageRotation = imageSize.rotation;
    const imageWidth = imageSize.width;
    const imageHeight = imageSize.height;
    DEV_LOG && console.log('processCameraImage', imagePath, previewResizeThreshold, quads, imageSize.width, imageSize.height, alwaysPromptForCrop);
    if (cropEnabled) {
        const start = Date.now();
        quads = await getJSONDocumentCornersFromFile(imagePath, { resizeThreshold: previewResizeThreshold * 1.5, areaScaleMinFactor });
        DEV_LOG && console.log('processCameraImage got quads', Date.now() - start, 'ms');
    }
    if (cropEnabled && (quads.length === 0 || alwaysPromptForCrop)) {
        let width = imageWidth;
        let height = imageHeight;
        if (imageRotation % 180 !== 0) {
            width = imageHeight;
            height = imageWidth;
        }
        let items = [
            {
                imagePath,
                imageWidth,
                imageHeight,
                imageRotation,
                undos: [],
                redos: [],
                quads:
                    quads.length > 0
                        ? quads
                        : ([
                              [
                                  [noDetectionMargin, noDetectionMargin],
                                  [width - noDetectionMargin, noDetectionMargin],
                                  [width - noDetectionMargin, height - noDetectionMargin],
                                  [noDetectionMargin, height - noDetectionMargin]
                              ]
                          ] as Quads)
            }
        ];
        if (alwaysPromptForCrop || autoScan === false) {
            onBeforeModalImport?.();
            const ModalImportImage = (await import('~/components/ModalImportImages.svelte')).default;
            items = await showModal({
                page: ModalImportImage,
                animated: true,
                fullscreen: true,
                props: {
                    items
                }
            });
            quads = items ? items[0].quads : undefined;
            onAfterModalImport?.();
        }
    }
    if (!cropEnabled || quads?.length) {
        await addCurrentImageToDocument({ 
                sourceImagePath: imagePath, 
                fileName, 
                imageWidth, 
                imageHeight, 
                imageRotation, 
                quads, 
                colorType, 
                colorMatrix, 
                pagesToAdd, 
                transforms,
                QRCodeOnly, 
            });
        return true;
    }
    showSnack({ message: lc('no_document_found') });
    return false;
}
export async function goToDocumentAfterScan(document?: OCRDocument, oldPagesNumber = 0, canGoToView = true) {
    if (oldPagesNumber === 0 || document.pages.length - oldPagesNumber === 1) {
        const component = (await import('~/components/edit/DocumentEdit.svelte')).default;
        DEV_LOG && console.log('goToDocumentAfterScan', document.pages.length);
        navigate({
            page: component,
            props: {
                document,
                startPageIndex: document.pages.length - 1,
                transitionOnBack: null
            }
        });
    } else if (canGoToView) {
        return goToDocumentView(document, false);
    }
}
export async function importImageFromCamera({ document, canGoToView = true, inverseUseSystemCamera = false, QRCodeOnly = false }: { document?: OCRDocument; canGoToView?: boolean; inverseUseSystemCamera?: boolean; QRCodeOnly?: boolean } = {}) {
    const useSystemCamera = __ANDROID__ ? ApplicationSettings.getBoolean('use_system_camera', USE_SYSTEM_CAMERA) : false;

    const result = await request('camera');
    if (result[0] !== 'authorized') {
        throw new PermissionError(lc('camera_permission_needed'));
    }
    DEV_LOG && console.log('importImageFromCamera', useSystemCamera, inverseUseSystemCamera);
    if (__ANDROID__ && (inverseUseSystemCamera ? !useSystemCamera : useSystemCamera)) {
        const resultImagePath = await new Promise<string>((resolve, reject) => {
            const takePictureIntent = new android.content.Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);

            let tempPictureUri;
            const context = Utils.android.getApplicationContext();
            const picturePath = context.getExternalFilesDir(null).getAbsolutePath() + SEPARATOR + 'NSIMG_' + dayjs().format('MM_DD_YYYY') + '.jpg';
            const nativeFile = new java.io.File(picturePath);

            if (SDK_VERSION >= 21) {
                tempPictureUri = androidx.core.content.FileProvider.getUriForFile(context, __APP_ID__ + '.provider', nativeFile);
            } else {
                tempPictureUri = android.net.Uri.fromFile(nativeFile);
            }

            takePictureIntent.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, tempPictureUri);
            takePictureIntent.putExtra('android.intent.extras.CAMERA_FACING', 0);
            let resolved = false;
            // if (takePictureIntent.resolveActivity(context.getPackageManager()) != null) {
            const REQUEST_IMAGE_CAPTURE = 3453;
            function onActivityResult(args) {
                const requestCode = args.requestCode;
                const resultCode = args.resultCode;

                if (requestCode === REQUEST_IMAGE_CAPTURE) {
                    Application.android.off(Application.android.activityResultEvent, onActivityResult);
                    if (resultCode === android.app.Activity.RESULT_OK) {
                        DEV_LOG && console.log('startActivityForResult got image', picturePath);
                        if (!resolved) {
                            resolved = true;
                            resolve(picturePath);
                        } else {
                            DEV_LOG && console.warn('startActivityForResult got another image!', picturePath);
                        }
                    } else if (resultCode === android.app.Activity.RESULT_CANCELED) {
                        // User cancelled the image capture
                        reject();
                    }
                }
            }
            Application.android.on(Application.android.activityResultEvent, onActivityResult);
            // on android a background event will trigger while picking a file
            securityService.ignoreNextValidation();
            DEV_LOG && console.log('startActivityForResult REQUEST_IMAGE_CAPTURE');
            Application.android.startActivity.startActivityForResult(takePictureIntent, REQUEST_IMAGE_CAPTURE);
            // } else {
            //     reject(new Error('camera_intent_not_supported'));
            // }
        });
        if (resultImagePath) {
            const pagesToAdd = [];
            const result = await processCameraImage({
                imagePath: resultImagePath,
                pagesToAdd,
                QRCodeOnly,
            });
            if (result && pagesToAdd.length) {
                if (!document) {
                    document = await OCRDocument.createDocument(pagesToAdd, QRCodeOnly);
                } else {
                    await document.addPages(pagesToAdd);
                }
                document.QRCodeOnly = QRCodeOnly;
                await goToDocumentAfterScan(document, 0, canGoToView);
            }
        }

        return;
    }
    const oldPagesNumber = document?.pages.length ?? 0;
    const Camera = (await import('~/components/camera/Camera.svelte')).default;
    document = await showModal({
        page: Camera,
        fullscreen: true,
        props: {
            document,
            QRCodeOnly,
        }
    });
    if (document) {
        document.QRCodeOnly = QRCodeOnly;
        return goToDocumentAfterScan(document, oldPagesNumber);
    }
}

export function createView<T extends View>(claz: new () => T, props: Partial<Pick<T, keyof T>> = {}, events?) {
    const view: T = new claz();
    Object.assign(view, props);
    if (events) {
        Object.keys(events).forEach((k) => view.on(k, events[k]));
    }
    return view;
}

export async function confirmGoBack({ onGoBack, message }: { onGoBack?; message? } = {}) {
    try {
        const result = await confirm({
            message: message || lc('sure_go_back')
        });
        if (result) {
            if (onGoBack) {
                onGoBack();
            } else {
                goBack();
            }
        }
    } catch (error) {
        showError(error);
    }
}

export async function onStartCam(inverseUseSystemCamera = false, QRCodeOnly = false) {
    try {
        await importImageFromCamera({ inverseUseSystemCamera, QRCodeOnly });
    } catch (error) {
        showError(error);
    }
}

export function getNameFormatHTMLArgs() {
    const cols = get(colors);
    return [
        `<span style="background-color:${cols.colorSurfaceContainerHigh};">iso</span>`,
        '<a href="https://en.m.wikipedia.org/wiki/ISO_8601">ISO 8641</a>',
        `<span style="background-color:${cols.colorSurfaceContainerHigh};">timestamp</span>`,
        `<span style="background-color:${cols.colorSurfaceContainerHigh};">Y,M,D,H,S...</span>`,
        `<a href="https://day.js.org/docs/en/display/format">${l('here')}</a>`
    ];
}
