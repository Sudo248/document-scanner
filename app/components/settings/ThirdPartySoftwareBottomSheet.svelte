<script lang="ts">
    import { Template } from 'svelte-native/components';
    import { openLink } from '~/utils/ui';
    import ListItemAutoSize from '~/components/common/ListItemAutoSize.svelte';
    // technique for only specific properties to get updated on store change

    const licences = require('~/licenses.json');

    const items = [
        {
            moduleName: 'OpenCV 4.8.0',
            moduleUrl: 'https://github.com/opencv/opencv'
        },
        {
            moduleName: 'tesseract 5.3.3',
            moduleUrl: 'https://github.com/tesseract-ocr/tesseract'
        },

        {
            moduleName: 'Material Design Icons',
            moduleUrl: 'https://pictogrammers.com/library/mdi/'
        },
        {
            moduleName: 'NativeScript',
            moduleUrl: 'https://github.com/NativeScript/NativeScript'
        }
    ]
        .concat(
            __ANDROID__
                ? [
                      {
                          moduleName: 'ZXing-C++',
                          moduleUrl: 'https://github.com/zxing-cpp/zxing-cpp'
                      }
                  ]
                : []
        )
        .concat(
            __ANDROID__
                ? [
                      {
                          moduleName: 'jsoncons',
                          moduleUrl: 'https://github.com/danielaparker/jsoncons'
                      }
                  ]
                : []
        )
        .concat(licences.dependencies);

    function onTap(item) {
        if (item.moduleUrl) {
            openLink(item.moduleUrl);
        }
    }
</script>

<gesturerootview rows="auto">
    <collectionView id="trackingScrollView" height="300" ios:contentInsetAdjustmentBehavior={2} itemIdGenerator={(item, i) => i} {items}>
        <Template let:item>
            <ListItemAutoSize subtitle={item.moduleUrl} title={item.moduleName} on:tap={() => onTap(item)} />
        </Template>
    </collectionView>
</gesturerootview>
