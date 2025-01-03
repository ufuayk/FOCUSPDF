pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

let currentPDF = null;
let currentPage = 1;
let zoomLevel = 2;
let lastLoadedFile = null;
let isFullScreen = false;
let thumbnailsVisible = false;
let isScrollMode = false;
let currentRotation = 0;

const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('fileInput');
const openFileBtn = document.getElementById('openFile');
const prevBtn = document.getElementById('prevPage');
const nextBtn = document.getElementById('nextPage');
const currentPageSpan = document.getElementById('currentPage');
const totalPagesSpan = document.getElementById('totalPages');
const zoomSelect = document.getElementById('zoomLevel');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const fitToPageBtn = document.getElementById('fitToPage');
const fullScreenBtn = document.getElementById('fullScreen');
const languageSelect = document.getElementById('languageSelect');
const darkModeToggle = document.getElementById('darkModeToggle');
const loadingOverlay = document.getElementById('loadingOverlay');
const noDocumentOverlay = document.getElementById('noDocumentOverlay');
const canvasWrapper = document.getElementById('canvasWrapper');
const pdfContainer = document.getElementById('pdfContainer');
const shortcutsBtn = document.getElementById('shortcuts-btn');
const shortcutsModal = document.getElementById('shortcuts-modal');
const closeShortcutsBtn = document.getElementById('close-shortcuts');
const printBtn = document.getElementById('printBtn');
const toggleThumbnailsBtn = document.getElementById('toggleThumbnails');
const thumbnailSidebar = document.getElementById('thumbnailSidebar');
const thumbnailContainer = document.getElementById('thumbnailContainer');
const scrollModeToggle = document.getElementById('scrollModeToggle');function updateTooltips() {
    document.querySelectorAll('[data-tooltip-key]').forEach(element => {
        const key = element.getAttribute('data-tooltip-key');
        const translation = i18next.t(key);
        const shortcut = getShortcutForKey(key);
        element.setAttribute('data-tooltip', `${translation}${shortcut ? ` (${shortcut})` : ''}`);
    });
}

function getShortcutForKey(key) {
    const shortcuts = {
        'zoomIn': 'Ctrl + +',
        'zoomOut': 'Ctrl + -',
        'fitToPage': 'Ctrl + 0',
        'fullScreen': 'F11',
        'theme': 'Alt + T',
        'thumbnails': 'Alt + E'
    };
    return shortcuts[key] || '';
}

shortcutsBtn.addEventListener('click', () => {
    shortcutsModal.classList.remove('hidden');
    shortcutsModal.classList.add('flex');
});

closeShortcutsBtn.addEventListener('click', () => {
    shortcutsModal.classList.add('hidden');
    shortcutsModal.classList.remove('flex');
});

shortcutsModal.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) {
        shortcutsModal.classList.add('hidden');
        shortcutsModal.classList.remove('flex');
    }
});

function showPDFContainer() {
    pdfContainer.classList.add('active');
    noDocumentOverlay.style.display = 'none';
}

function hidePDFContainer() {
    pdfContainer.classList.remove('active');
    noDocumentOverlay.style.display = 'flex';
}

const isDarkMode = localStorage.getItem('darkMode') === 'true' || 
                  window.matchMedia('(prefers-color-scheme: dark)').matches;
if (isDarkMode) document.documentElement.classList.add('dark');

darkModeToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
});

fullScreenBtn.addEventListener('click', toggleFullScreen);

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        pdfContainer.requestFullscreen().catch(err => {
            console.error(`Tam ekran hatası: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

document.addEventListener('fullscreenchange', () => {
    isFullScreen = !!document.fullscreenElement;
    fullScreenBtn.querySelector('i').classList.toggle('fa-compress-arrows-alt', isFullScreen);
    fullScreenBtn.querySelector('i').classList.toggle('fa-expand-arrows-alt', !isFullScreen);
    const tooltipKey = isFullScreen ? 'exitFullScreen' : 'fullScreen';
    fullScreenBtn.setAttribute('data-tooltip-key', tooltipKey);
    updateTooltips();
});

async function loadLastPDF() {
    const lastPDF = localStorage.getItem('lastPDF');
    const lastPage = localStorage.getItem('lastPage');
    const lastZoom = localStorage.getItem('lastZoom');

    if (lastPDF) {
        try {
            const pdfData = new Uint8Array(JSON.parse(lastPDF));
            await loadPDFFromData(pdfData);
            
            if (lastPage) {
                currentPage = parseInt(lastPage);
                await renderPage();
            }
            
            if (lastZoom) {
                zoomLevel = parseFloat(lastZoom);
                zoomSelect.value = zoomLevel;
                await renderPage();
            }
        } catch (error) {
            console.error('Son PDF yüklenirken hata:', error);
            localStorage.removeItem('lastPDF');
            localStorage.removeItem('lastPage');
            localStorage.removeItem('lastZoom');
            hidePDFContainer();
        }
    } else {
        hidePDFContainer();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadLastPDF();
    updateTooltips();
});

i18next
    .use(i18nextBrowserLanguageDetector)
    .init({
        resources: LANGUAGES,
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false
        }
    }).then(() => {
        const savedLanguage = localStorage.getItem('selectedLanguage');
        if (savedLanguage) {
            i18next.changeLanguage(savedLanguage).then(() => {
                languageSelect.value = savedLanguage;
                updateTranslations();
                updateTooltips();
            });
        }
    });

function updateTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = i18next.t(key);
    });
    document.querySelectorAll('[data-i18n-key]').forEach(element => {
        const key = element.getAttribute('data-i18n-key');
        element.textContent = i18next.t(key);
    });
    updateTooltips();
}

languageSelect.addEventListener('change', (e) => {
    const lang = e.target.value;
    i18next.changeLanguage(lang).then(() => {
        localStorage.setItem('selectedLanguage', lang);
        updateTranslations();
    });
});

document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pdfContainer.classList.add('drag-over');
});

document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pdfContainer.classList.remove('drag-over');
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pdfContainer.classList.remove('drag-over');
    
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        loadPDF(file);
    }
});

async function loadPDF(file) {
    loadingOverlay.classList.remove('hidden');
    showPDFContainer();
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const typedarray = new Uint8Array(e.target.result);
        await loadPDFFromData(typedarray);
        
        localStorage.setItem('lastPDF', JSON.stringify(Array.from(typedarray)));
        localStorage.setItem('lastPage', currentPage);
        
        zoomLevel = 2;
        zoomSelect.value = "2";
        localStorage.setItem('lastZoom', zoomLevel);
        await renderPage();
    };
    reader.readAsArrayBuffer(file);
}

async function loadPDFFromData(data) {
    try {
        currentPDF = await pdfjsLib.getDocument(data).promise;
        totalPagesSpan.textContent = currentPDF.numPages;
        currentPage = 1;
        
        if (isScrollMode) {
            await renderAllPages();
        } else {
            await renderPage();
        }
        
        if (thumbnailsVisible) {
            await renderThumbnails();
        }
        
        loadingOverlay.classList.add('hidden');
        showPDFContainer();
    } catch (error) {
        console.error('PDF yükleme hatası:', error);
        loadingOverlay.classList.add('hidden');
        hidePDFContainer();
    }
}

async function renderPage() {
    if (!currentPDF || isScrollMode) return;

    loadingOverlay.classList.remove('hidden');
    const page = await currentPDF.getPage(currentPage);
    
    let viewport = page.getViewport({ scale: zoomLevel, rotation: currentRotation });

    const canvas = document.getElementById('pdfCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
        textLayer: true,
        renderInteractiveForms: true
    };

    try {
        await page.render(renderContext).promise;
        updatePageDisplay();
        updateButtons();
        
        if (thumbnailsVisible) {
            document.querySelectorAll('#thumbnailContainer > div').forEach(div => {
                div.classList.remove('bg-blue-100', 'dark:bg-blue-900');
            });
            const thumbnails = document.querySelectorAll('#thumbnailContainer > div');
            if (thumbnails[currentPage - 1]) {
                thumbnails[currentPage - 1].classList.add('bg-blue-100', 'dark:bg-blue-900');
                thumbnails[currentPage - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
        
        loadingOverlay.classList.add('hidden');
        localStorage.setItem('lastPage', currentPage);
    } catch (error) {
        console.error('Sayfa render hatası:', error);
        loadingOverlay.classList.add('hidden');
    }
}

function updateButtons() {
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= currentPDF?.numPages;
    prevBtn.classList.toggle('opacity-50', prevBtn.disabled);
    nextBtn.classList.toggle('opacity-50', nextBtn.disabled);
}

function setZoom(newZoom) {
    newZoom = Math.round(newZoom * 4) / 4;
    zoomLevel = Math.max(0.5, Math.min(3, newZoom));
    
    const closestOption = Array.from(zoomSelect.options)
        .find(option => Math.abs(parseFloat(option.value) - zoomLevel) < 0.1);
    if (closestOption) {
        zoomSelect.value = closestOption.value;
        zoomLevel = parseFloat(closestOption.value);
    }
    
    localStorage.setItem('lastZoom', zoomLevel);
    
    if (isScrollMode) {
        renderAllPages();
    } else {
        renderPage();
    }
}

function fitToPage() {
    if (!currentPDF) return;
    
    const containerWidth = canvasWrapper.clientWidth - 40;
    const containerHeight = canvasWrapper.clientHeight - 40;
    
    currentPDF.getPage(currentPage).then(page => {
        const viewport = page.getViewport({ scale: 1 });
        const scaleWidth = containerWidth / viewport.width;
        const scaleHeight = containerHeight / viewport.height;
        const scale = Math.min(scaleWidth, scaleHeight);
        setZoom(scale);
    });
}

openFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) loadPDF(e.target.files[0]);
});

prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        if (isScrollMode) {
            const canvases = canvasWrapper.querySelectorAll('canvas');
            canvases[currentPage - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            renderPage();
        }
    }
});

nextBtn.addEventListener('click', () => {
    if (currentPDF && currentPage < currentPDF.numPages) {
        currentPage++;
        if (isScrollMode) {
            const canvases = canvasWrapper.querySelectorAll('canvas');
            canvases[currentPage - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            renderPage();
        }
    }
});

zoomSelect.addEventListener('change', (e) => {
    setZoom(parseFloat(e.target.value));
});

zoomInBtn.addEventListener('click', () => setZoom(zoomLevel + 0.25));
zoomOutBtn.addEventListener('click', () => setZoom(zoomLevel - 0.25));
fitToPageBtn.addEventListener('click', fitToPage);

canvasWrapper.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.25 : 0.25;
        setZoom(zoomLevel + delta);
    } else if (e.altKey) {
        e.preventDefault();
        if (e.deltaY > 0 && currentPage < currentPDF?.numPages) {
            currentPage++;
            renderPage();
        } else if (e.deltaY < 0 && currentPage > 1) {
            currentPage--;
            renderPage();
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    switch(e.key) {
        case 'ArrowLeft':
            if (currentPage > 1) {
                currentPage--;
                renderPage();
            }
            break;
        case 'ArrowRight':
            if (currentPDF && currentPage < currentPDF.numPages) {
                currentPage++;
                renderPage();
            }
            break;
        case '+':
            if (e.ctrlKey) {
                e.preventDefault();
                setZoom(zoomLevel + 0.25);
            }
            break;
        case '-':
            if (e.ctrlKey) {
                e.preventDefault();
                setZoom(zoomLevel - 0.25);
            }
            break;
        case '0':
            if (e.ctrlKey) {
                e.preventDefault();
                fitToPage();
            }
            break;
        case 'F11':
            e.preventDefault();
            toggleFullScreen();
            break;
        case 'e':
            if (e.altKey) {
                e.preventDefault();
                toggleThumbnailsBtn.click();
            }
            break;
        case 't':
            if (e.altKey) {
                e.preventDefault();
                darkModeToggle.click();
            }
            break;
        case 'Escape':
            if (shortcutsModal.classList.contains('flex')) {
                shortcutsModal.classList.add('hidden');
                shortcutsModal.classList.remove('flex');
            }
            break;
        case 'p':
            if (e.ctrlKey) {
                e.preventDefault();
                printBtn.click();
            }
            break;
        case 'r':
            if (e.altKey) {
                e.preventDefault();
                currentRotation = (currentRotation + 90) % 360;
                renderPage();
            }
            break;
        case 'l':
            if (e.altKey) {
                e.preventDefault();
                currentRotation = (currentRotation - 90) % 360;
                if (currentRotation < 0) currentRotation += 360;
                renderPage();
            }
            break;
    }
});

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (currentPDF) renderPage();
    }, 200);
});

function changeLanguage(lang) {
    i18next.changeLanguage(lang, (err, t) => {
        if (err) return console.error('Dil değiştirme hatası:', err);
        updateTranslations();
        localStorage.setItem('selectedLanguage', lang);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const savedLanguage = localStorage.getItem('selectedLanguage');
    if (savedLanguage) {
        languageSelect.value = savedLanguage;
        changeLanguage(savedLanguage);
    }
});

languageSelect.addEventListener('change', (e) => {
    changeLanguage(e.target.value);
});

printBtn.addEventListener('click', async () => {
    if (!currentPDF) return;

    loadingOverlay.classList.remove('hidden');
    
    try {
        const pdf = await currentPDF.getPage(currentPage);
        const viewport = pdf.getViewport({ scale: 1 });
        
        const printCanvas = document.createElement('canvas');
        const context = printCanvas.getContext('2d');
        
        printCanvas.width = viewport.width;
        printCanvas.height = viewport.height;
        
        await pdf.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        const dataUrl = printCanvas.toDataURL('image/png');
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Print PDF Page ${currentPage}</title>
                    <style>
                        body { margin: 0; display: flex; justify-content: center; }
                        img { max-width: 100%; height: auto; }
                        @media print {
                            body { -webkit-print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    <img src="${dataUrl}" onload="window.print(); window.close();">
                </body>
            </html>
        `);
        printWindow.document.close();
        
    } catch (error) {
        console.error('Yazdırma hatası:', error);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
});

toggleThumbnailsBtn.addEventListener('click', async () => {
    thumbnailsVisible = !thumbnailsVisible;
    
    if (thumbnailsVisible) {
        thumbnailSidebar.classList.remove('hidden');
        if (currentPDF) {
            loadingOverlay.classList.remove('hidden');
            await renderThumbnails();
            loadingOverlay.classList.add('hidden');
        }
    } else {
        thumbnailSidebar.classList.add('hidden');
    }
});

async function renderThumbnails() {
    thumbnailContainer.innerHTML = '';
    const numPages = currentPDF.numPages;
    
    for (let i = 1; i <= numPages; i++) {
        const page = await currentPDF.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });
        
        const thumbnailCanvas = document.createElement('canvas');
        const context = thumbnailCanvas.getContext('2d');
        thumbnailCanvas.width = viewport.width;
        thumbnailCanvas.height = viewport.height;
        
        const thumbnailWrapper = document.createElement('div');
        thumbnailWrapper.className = `relative cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-lg ${currentPage === i ? 'bg-blue-100 dark:bg-blue-900' : ''}`;
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        const pageLabel = document.createElement('div');
        pageLabel.className = 'text-sm text-gray-600 dark:text-gray-300 mt-1 text-center';
        pageLabel.textContent = `${i} / ${numPages}`;
        
        thumbnailWrapper.appendChild(thumbnailCanvas);
        thumbnailWrapper.appendChild(pageLabel);
        
        thumbnailWrapper.addEventListener('click', () => {
            currentPage = i;
            renderPage();
            document.querySelectorAll('#thumbnailContainer > div').forEach(div => {
                div.classList.remove('bg-blue-100', 'dark:bg-blue-900');
            });
            thumbnailWrapper.classList.add('bg-blue-100', 'dark:bg-blue-900');
        });
        
        thumbnailContainer.appendChild(thumbnailWrapper);
    }
}

function updatePageDisplay() {
    const input = document.getElementById('currentPage');
    input.value = currentPage.toString();
}

const pageInput = document.getElementById('currentPage');

pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const newPage = parseInt(e.target.value);
        if (currentPDF && !isNaN(newPage) && newPage >= 1 && newPage <= currentPDF.numPages) {
            currentPage = newPage;
            if (isScrollMode) {
                const canvases = canvasWrapper.querySelectorAll('canvas');
                canvases[currentPage - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                renderPage();
            }
        } else {
            updatePageDisplay();
        }
        pageInput.blur();
    }
});

pageInput.addEventListener('blur', () => {
    const newPage = parseInt(pageInput.value);
    if (currentPDF && !isNaN(newPage) && newPage >= 1 && newPage <= currentPDF.numPages) {
        if (newPage !== currentPage) {
            currentPage = newPage;
            renderPage();
        }
    } else {
        updatePageDisplay();
    }
});

pageInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
});

scrollModeToggle.addEventListener('click', async () => {
    loadingOverlay.classList.remove('hidden');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    isScrollMode = !isScrollMode;
    scrollModeToggle.querySelector('i').classList.toggle('fa-scroll', !isScrollMode);
    scrollModeToggle.querySelector('i').classList.toggle('fa-file', isScrollMode);
    
    localStorage.setItem('isScrollMode', isScrollMode);
    
    await renderAllPages();
});

async function renderAllPages() {
    if (!currentPDF) return;

    try {
        canvasWrapper.innerHTML = '';

        if (!isScrollMode) {
            const canvas = document.createElement('canvas');
            canvas.id = 'pdfCanvas';
            canvas.className = 'mx-auto border border-gray-200 dark:border-gray-700 rounded-md transition-shadow duration-300';
            canvasWrapper.appendChild(canvas);
            
            window.pdfCanvas = canvas;
            window.canvas = canvas;
            ctx = canvas.getContext('2d');
            
            const page = await currentPDF.getPage(currentPage);
            const viewport = page.getViewport({ scale: zoomLevel });
            
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            await page.render({
                canvasContext: ctx,
                viewport: viewport,
                textLayer: true,
                renderInteractiveForms: true
            }).promise;
            
            updatePageDisplay();
            updateButtons();
        } else {
            const container = document.createElement('div');
            container.className = 'flex flex-col gap-4 items-center p-4';
            
            for (let pageNum = 1; pageNum <= currentPDF.numPages; pageNum++) {
                const canvas = document.createElement('canvas');
                canvas.className = 'border border-gray-200 dark:border-gray-700 rounded-md transition-shadow duration-300';
                container.appendChild(canvas);
                
                const page = await currentPDF.getPage(pageNum);
                const viewport = page.getViewport({ scale: zoomLevel });
                
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                const context = canvas.getContext('2d');
                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;
            }
            
            canvasWrapper.appendChild(container);
            
            setTimeout(() => {
                const canvases = canvasWrapper.querySelectorAll('canvas');
                if (canvases[currentPage - 1]) {
                    canvases[currentPage - 1].scrollIntoView({ behavior: 'auto', block: 'start' });
                }
            }, 100);
        }
    } catch (error) {
        console.error('Sayfa render hatası:', error);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

canvasWrapper.addEventListener('scroll', () => {
    if (!isScrollMode || !currentPDF) return;

    const canvases = canvasWrapper.querySelectorAll('canvas');
    const containerTop = canvasWrapper.scrollTop;
    const containerHeight = canvasWrapper.clientHeight;
    
    let currentVisiblePage = 1;
    let maxVisibility = 0;

    canvases.forEach((canvas, index) => {
        const rect = canvas.getBoundingClientRect();
        const canvasTop = rect.top;
        const canvasHeight = rect.height;
        
        const visibleHeight = Math.min(containerHeight, 
            Math.max(0, Math.min(canvasTop + canvasHeight, containerHeight) - Math.max(canvasTop, 0)));
        const visibilityPercent = visibleHeight / canvasHeight;
        
        if (visibilityPercent > maxVisibility) {
            maxVisibility = visibilityPercent;
            currentVisiblePage = index + 1;
        }
    });

    if (currentPage !== currentVisiblePage) {
        currentPage = currentVisiblePage;
        updatePageDisplay();
        updateButtons();
        
        if (thumbnailsVisible) {
            document.querySelectorAll('#thumbnailContainer > div').forEach(div => {
                div.classList.remove('bg-blue-100', 'dark:bg-blue-900');
            });
            const thumbnails = document.querySelectorAll('#thumbnailContainer > div');
            if (thumbnails[currentPage - 1]) {
                thumbnails[currentPage - 1].classList.add('bg-blue-100', 'dark:bg-blue-900');
                thumbnails[currentPage - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const savedScrollMode = localStorage.getItem('isScrollMode') === 'true';
    if (savedScrollMode !== isScrollMode) {
        isScrollMode = savedScrollMode;
        scrollModeToggle.querySelector('i').classList.toggle('fa-scroll', !isScrollMode);
        scrollModeToggle.querySelector('i').classList.toggle('fa-file', isScrollMode);
        if (currentPDF) {
            renderAllPages();
        }
    }
});