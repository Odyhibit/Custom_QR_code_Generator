// QR Code Generator - Main Application
// Orchestrates the 3-step wizard and connects all components

const App = {
    // Application state
    state: {
        currentStep: 1,
        currentType: 'text',
        formData: {},
        qrContent: '',
        matrix: null,
        version: null,
        debounceTimer: null,
        // Logo dragging state
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        logoStartX: 50,
        logoStartY: 50,
        // Encoding state for padding modification
        bitstreamData: null,
        blocks: null,
        maskPattern: 0,
        eccLevel: 'M',
        paddingModuleMap: null,
        editableCells: new Set(),
        originalPaddingBytes: null,
        // Paint mode state
        interactionMode: 'paint',   // 'logo' or 'paint'
        brushMode: 'black',         // 'black' or 'white'
        paddingEdits: new Map(),     // "row,col" → boolean (true=dark)
        isPaintingModule: false,
        paintUpdateTimeout: null,
        lastHighlightCell: null,
        // Box selection state (shift+drag)
        isBoxSelecting: false,
        boxSelectStart: null,
        boxSelectEnd: null,
        // Delete step state
        deleteState: {
            deletedCodewords: new Set(),
            deletedModuleEdits: new Map(), // "row,col" → boolean (true=dark) for painted deleted modules
            hoveredCodewordIndex: null,
            hoveredBlockIndex: null,
            codewordMap: null,
            reverseMap: null,
            blockInfo: [],
            totalCodewords: 0,
            blockColors: ['#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#98D8C8',
                          '#F7DC6F','#BB8FCE','#85C1E2','#F8B88B','#ABEBC6'],
            hideOverlays: false,
            // Paint mode for deleted modules
            interactionMode: 'delete', // 'delete' or 'paint'
            brushMode: 'black',
            isPainting: false,
            isBoxSelecting: false,
            boxSelectStart: null,
            boxSelectEnd: null
        },
        deleteEventsInitialized: false
    },

    // Initialize application
    init() {
        this.setupTypeSelector();
        this.setupStepNavigation();
        this.setupFormHandlers();
        this.setupLogoControls();
        this.setupPaintMode();
        this.setupStyleControls();
        this.setupDeleteStep();
        this.setupProjectIO();

        // Render initial form
        this.renderForm('text');
    },

    // Setup type selector cards
    setupTypeSelector() {
        const cards = document.querySelectorAll('.type-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                // Update active state
                cards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');

                // Update type and render form
                const type = card.dataset.type;
                this.state.currentType = type;
                this.renderForm(type);
            });
        });
    },

    // Setup step navigation
    setupStepNavigation() {
        const stepBtns = document.querySelectorAll('.step-btn');

        stepBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const step = parseInt(btn.dataset.step);
                this.goToStep(step);
            });
        });

        // Step 1 buttons
        document.getElementById('nextBtn1').addEventListener('click', () => {
            if (this.validateForm()) {
                this.goToStep(2);
            }
        });

        // Step 2 buttons
        document.getElementById('backBtn2').addEventListener('click', () => {
            this.goToStep(1);
        });

        document.getElementById('nextBtn2').addEventListener('click', () => {
            this.goToStep(3);
        });

        // Step 3 buttons
        document.getElementById('backBtn3').addEventListener('click', () => {
            this.goToStep(2);
        });

        document.getElementById('nextBtn3').addEventListener('click', () => {
            this.goToStep(4);
        });

        // Step 4 buttons
        document.getElementById('backBtn4').addEventListener('click', () => {
            this.goToStep(3);
        });
    },

    // Go to specific step
    goToStep(step) {
        this.state.currentStep = step;

        // Update step buttons
        document.querySelectorAll('.step-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.step) === step);
        });

        // Update sections
        document.querySelectorAll('.step-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`step${step}`).classList.add('active');

        // Actions per step
        if (step === 2) {
            // Only regenerate if we don't have a matrix yet
            if (!this.state.matrix) {
                this.generateQR();
            }
            this.updatePaintControlsVisibility();
            this.renderLogoCanvas();
        } else if (step === 3) {
            // Don't regenerate - use the existing (possibly optimized) matrix
            if (QRRenderer.state.colorMode === 'palette') {
                this.displayPalette();
            }
            this.renderMainCanvas();
        } else if (step === 4) {
            // Build codeword map if needed
            if (!this.state.deleteState.codewordMap && this.state.blocks && this.state.matrix) {
                this.buildCodewordMap();
            }
            this.renderDeleteCanvas();
            this.updateDeleteBlockLegend();
        }
    },

    // Render dynamic form based on type
    renderForm(typeKey) {
        const type = QRTypes.getType(typeKey);
        if (!type) return;

        const form = document.getElementById('inputForm');
        form.innerHTML = '';

        // Group fields into rows for certain types
        const fieldsPerRow = {
            vcard: [['firstName', 'lastName'], ['phone', 'email'], ['company', 'title'], ['website'], ['address']],
            event: [['title'], ['startDate', 'startTime'], ['endDate', 'endTime'], ['location'], ['description']],
            geo: [['latitude', 'longitude'], ['label']]
        };

        const rows = fieldsPerRow[typeKey];

        if (rows) {
            // Use predefined row groupings
            rows.forEach(rowFields => {
                if (rowFields.length === 1) {
                    const field = type.fields.find(f => f.name === rowFields[0]);
                    if (field) form.appendChild(this.createFieldElement(field));
                } else {
                    const rowDiv = document.createElement('div');
                    rowDiv.className = 'form-row';
                    rowFields.forEach(fieldName => {
                        const field = type.fields.find(f => f.name === fieldName);
                        if (field) rowDiv.appendChild(this.createFieldElement(field));
                    });
                    form.appendChild(rowDiv);
                }
            });
        } else {
            // Single column for simple types
            type.fields.forEach(field => {
                form.appendChild(this.createFieldElement(field));
            });
        }

        // Setup input handlers
        this.setupFormHandlers();

        // Clear form data for new type
        this.state.formData = {};

        // Set default values
        type.fields.forEach(field => {
            if (field.type === 'select' && field.options && field.options.length > 0) {
                this.state.formData[field.name] = field.options[0].value;
            }
        });

        // Trigger initial generation
        this.scheduleQRUpdate();
    },

    // Create a single form field element
    createFieldElement(field) {
        const div = document.createElement('div');
        div.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = field.label;
        if (field.required) {
            label.innerHTML += ' <span style="color: #ef4444">*</span>';
        }
        div.appendChild(label);

        let input;

        if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.placeholder = field.placeholder || '';
        } else if (field.type === 'select') {
            input = document.createElement('select');
            field.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                input.appendChild(option);
            });
        } else if (field.type === 'checkbox') {
            const checkWrapper = document.createElement('div');
            checkWrapper.style.display = 'flex';
            checkWrapper.style.alignItems = 'center';

            input = document.createElement('input');
            input.type = 'checkbox';
            input.id = `field-${field.name}`;

            const checkLabel = document.createElement('label');
            checkLabel.htmlFor = `field-${field.name}`;
            checkLabel.textContent = field.label;
            checkLabel.style.marginBottom = '0';

            checkWrapper.appendChild(input);
            checkWrapper.appendChild(checkLabel);

            // Replace label with wrapper
            div.innerHTML = '';
            div.appendChild(checkWrapper);
        } else {
            input = document.createElement('input');
            input.type = field.type || 'text';
            input.placeholder = field.placeholder || '';
            if (field.step) input.step = field.step;
        }

        input.name = field.name;
        input.dataset.fieldName = field.name;
        if (field.required) input.required = true;

        if (field.type !== 'checkbox') {
            div.appendChild(input);
        } else {
            // Checkbox already added in wrapper
            div.querySelector('input').dataset.fieldName = field.name;
        }

        return div;
    },

    // Setup form input handlers
    setupFormHandlers() {
        const form = document.getElementById('inputForm');
        const inputs = form.querySelectorAll('input, textarea, select');

        inputs.forEach(input => {
            const eventType = input.type === 'checkbox' ? 'change' : 'input';
            input.addEventListener(eventType, (e) => {
                const fieldName = e.target.dataset.fieldName;
                const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                this.state.formData[fieldName] = value;
                this.scheduleQRUpdate();
            });
        });
    },

    // Debounced QR update
    scheduleQRUpdate() {
        clearTimeout(this.state.debounceTimer);
        this.state.debounceTimer = setTimeout(() => {
            this.generateQR();
            this.renderPreview();
        }, 300);
    },

    // Validate form
    validateForm() {
        const type = QRTypes.getType(this.state.currentType);
        const validation = QRTypes.validate(this.state.currentType, this.state.formData);

        if (!validation.valid) {
            alert(validation.errors.join('\n'));
            return false;
        }

        return true;
    },

    // Generate QR code
    generateQR() {
        try {
            // Format content based on type
            const content = QRTypes.format(this.state.currentType, this.state.formData);
            if (!content || content.trim() === '') {
                this.state.matrix = null;
                this.state.qrContent = '';
                return;
            }

            this.state.qrContent = content;

            // Clear paint state on regeneration
            this.state.paddingEdits = new Map();
            this.resetPaintModeUI();

            // Clear delete state on regeneration
            this.state.deleteState.deletedCodewords = new Set();
            this.state.deleteState.deletedModuleEdits = new Map();
            this.state.deleteState.codewordMap = null;
            this.state.deleteState.reverseMap = null;
            this.state.deleteState.blockInfo = [];
            this.state.deleteState.hoveredCodewordIndex = null;
            this.state.deleteState.hoveredBlockIndex = null;

            // Determine version
            let version = this.getSelectedVersion();
            const mode = this.detectMode(content);

            // Get selected ECC level
            const eccLevel = this.getSelectedEccLevel();
            this.state.eccLevel = eccLevel;

            // Find minimum version that fits
            if (version === 'auto') {
                version = this.findMinVersion(content, mode, eccLevel);
            } else {
                version = parseInt(version);
                // Check if selected version can fit the content at this ECC level
                // If not, find the minimum version that works (but never go below selected)
                const minRequired = this.findMinVersion(content, mode, eccLevel);
                if (minRequired > version) {
                    version = minRequired;
                    // Update the dropdown to reflect the auto-increased version
                    const versionSelect = document.getElementById('versionSelect');
                    if (versionSelect) {
                        // Find a matching option or set to closest higher one
                        const options = Array.from(versionSelect.options).map(o => o.value);
                        const validOption = options.find(o => o !== 'auto' && parseInt(o) >= version);
                        if (validOption) {
                            versionSelect.value = validOption;
                            version = parseInt(validOption);
                        }
                    }
                }
            }

            this.state.version = version;
            this.state.maskPattern = 0; // Default mask pattern

            // Generate bitstream
            const bitstreamData = generateBitstream(content, mode, version, eccLevel, capacityTable);

            // Store bitstreamData for padding modification
            this.state.bitstreamData = bitstreamData;

            // Split into blocks and calculate ECC
            let blocks = splitIntoBlocks(bitstreamData.dataBytes, version, eccLevel, blockSizeTable);
            blocks = calculateEccForBlocks(blocks);

            // Store blocks for padding modification
            this.state.blocks = blocks;

            // Interleave
            const interleaved = interleaveBlocks(blocks);

            // Create matrix
            const size = getQrSize(version);
            const matrix = createMatrix(size);

            // Place patterns and data
            placeFunctionPatterns(matrix, version);
            placeDataBits(matrix, interleaved);
            applyMask(matrix, this.state.maskPattern, version);
            placeFormatInfo(matrix, eccLevel, this.state.maskPattern, version);
            placeVersionInfo(matrix, version);

            this.state.matrix = matrix;

            // Build padding module map if there are padding bytes
            if (bitstreamData.padBytes && bitstreamData.padBytes.length > 0) {
                this.buildPaddingModuleMap();
            } else {
                this.state.paddingModuleMap = null;
                this.state.editableCells = new Set();
                this.state.originalPaddingBytes = null;
            }
        } catch (e) {
            console.error('QR generation error:', e);
            this.state.matrix = null;
        }
    },

    // Detect encoding mode
    detectMode(text) {
        if (/^\d+$/.test(text)) return 'numeric';
        if (/^[0-9A-Z $%*+\-./:]+$/.test(text)) return 'alphanumeric';
        return 'byte';
    },

    // Find minimum version that fits content
    findMinVersion(content, mode, eccLevel) {
        for (let v = 1; v <= 40; v++) {
            const key = `${v}-${eccLevel}`;
            const capacity = capacityTable[key];
            if (!capacity) continue;

            const charCountBits = getCharCountIndicatorSize(v, mode);
            let dataBits;

            if (mode === 'numeric') {
                dataBits = Math.ceil(content.length / 3) * 10;
                if (content.length % 3 === 1) dataBits += 4 - 10;
                if (content.length % 3 === 2) dataBits += 7 - 10;
            } else if (mode === 'alphanumeric') {
                dataBits = Math.floor(content.length / 2) * 11 + (content.length % 2) * 6;
            } else {
                dataBits = content.length * 8;
            }

            const totalBits = 4 + charCountBits + dataBits;
            const availableBits = capacity * 8;

            if (totalBits <= availableBits) {
                return v;
            }
        }
        return 10; // Default to version 10
    },

    // Get selected version
    getSelectedVersion() {
        const select = document.getElementById('versionSelect');
        return select ? select.value : 'auto';
    },

    // Get selected ECC level
    getSelectedEccLevel() {
        const select = document.getElementById('eccSelect');
        return select ? select.value : 'M';
    },

    // Render small preview (step 1)
    renderPreview() {
        const canvas = document.getElementById('previewCanvas');
        if (!canvas || !this.state.matrix) {
            // Clear canvas if no matrix
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#f3f4f6';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#9ca3af';
                ctx.font = '14px system-ui';
                ctx.textAlign = 'center';
                ctx.fillText('Enter content above', canvas.width / 2, canvas.height / 2);
            }
            return;
        }

        // Simple B&W render for preview
        const ctx = canvas.getContext('2d');
        const size = this.state.matrix.length;
        const quietZone = 2;
        const totalSize = size + (quietZone * 2);
        const moduleSize = canvas.width / totalSize;
        const offset = quietZone * moduleSize;

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'black';
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                if (this.state.matrix[row][col]) {
                    ctx.fillRect(
                        offset + col * moduleSize,
                        offset + row * moduleSize,
                        moduleSize,
                        moduleSize
                    );
                }
            }
        }
    },

    // ========== Logo Controls (Step 2) ==========
    setupLogoControls() {
        const logoInput = document.getElementById('logoInput');
        const uploadBtn = document.getElementById('uploadLogoBtn');
        const clearBtn = document.getElementById('clearLogoBtn');
        const logoAdjustments = document.getElementById('logoAdjustments');
        const logoCanvas = document.getElementById('logoCanvas');
        const canvasHint = document.getElementById('logoCanvasHint');

        uploadBtn.addEventListener('click', () => logoInput.click());

        logoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                QRRenderer.loadLogo(file, () => {
                    clearBtn.style.display = 'inline-flex';
                    logoAdjustments.style.display = 'block';
                    canvasHint.style.display = 'none';

                    // Enable Move Logo button and switch to logo mode
                    const moveLogoBtn = document.getElementById('moveLogoBtn');
                    if (moveLogoBtn) moveLogoBtn.disabled = false;

                    this.state.interactionMode = 'logo';
                    logoCanvas.classList.add('draggable');
                    logoCanvas.classList.remove('paint-mode');

                    // Update toggle buttons
                    document.querySelectorAll('#paintModeControls .mode-btn').forEach(b => b.classList.remove('active'));
                    if (moveLogoBtn) moveLogoBtn.classList.add('active');

                    // Hide brush controls, update hint
                    const brushControls = document.getElementById('brushControls');
                    if (brushControls) brushControls.style.display = 'none';
                    const modeHint = document.getElementById('modeHint');
                    if (modeHint) modeHint.textContent = 'Drag to move logo';

                    // Show optimize section and flag logo loaded for style tab
                    const optimizeMaskSection = document.getElementById('optimizeMaskSection');
                    if (optimizeMaskSection) optimizeMaskSection.style.display = 'block';
                    const moduleColorMode = document.getElementById('moduleColorMode');
                    if (moduleColorMode) moduleColorMode.style.display = 'block';
                    const simpleColorMode = document.getElementById('simpleColorMode');
                    if (simpleColorMode) simpleColorMode.style.display = 'none';
                    const backgroundFillGroup = document.getElementById('backgroundFillGroup');
                    if (backgroundFillGroup) backgroundFillGroup.style.display = 'block';

                    // Switch to palette mode for logo
                    QRRenderer.state.colorMode = 'palette';
                    document.getElementById('colorMode').value = 'palette';

                    // Auto-detect background fill
                    this.autoDetectBackgroundFill();

                    // Refresh palette pickers with newly extracted colors
                    this.displayPalette();
                    document.getElementById('paletteDisplay').style.display = 'block';

                    this.renderLogoCanvas();
                });
            }
        });

        clearBtn.addEventListener('click', () => {
            QRRenderer.clearLogo();
            logoInput.value = '';
            clearBtn.style.display = 'none';
            logoAdjustments.style.display = 'none';
            canvasHint.style.display = 'block';
            logoCanvas.classList.remove('draggable');
            this.resetPaintModeUI();

            // Hide optimize section and color mode, switch to simple colors
            const optimizeMaskSection = document.getElementById('optimizeMaskSection');
            if (optimizeMaskSection) optimizeMaskSection.style.display = 'none';
            const optimizeResult = document.getElementById('optimizeResult');
            if (optimizeResult) optimizeResult.style.display = 'none';
            const moduleColorMode = document.getElementById('moduleColorMode');
            if (moduleColorMode) moduleColorMode.style.display = 'none';
            const simpleColorMode = document.getElementById('simpleColorMode');
            if (simpleColorMode) simpleColorMode.style.display = 'block';
            document.getElementById('colorMode').value = 'palette';
            QRRenderer.state.colorMode = 'simple';
            const paletteDisplay = document.getElementById('paletteDisplay');
            if (paletteDisplay) paletteDisplay.style.display = 'none';
            const gradientControls = document.getElementById('gradientControls');
            if (gradientControls) gradientControls.style.display = 'none';
            const backgroundFillGroup = document.getElementById('backgroundFillGroup');
            if (backgroundFillGroup) backgroundFillGroup.style.display = 'none';
            document.getElementById('backgroundFill').value = 'light';
            QRRenderer.state.backgroundFill = 'light';

            this.renderLogoCanvas();
        });

        // Optimize mask button
        document.getElementById('optimizeMaskBtn').addEventListener('click', () => {
            this.optimizeMaskForLogo();
        });

        // Logo scale
        const logoScale = document.getElementById('logoScale');
        const logoScaleValue = document.getElementById('logoScaleValue');
        logoScale.addEventListener('input', (e) => {
            QRRenderer.state.logoScale = parseInt(e.target.value);
            logoScaleValue.textContent = e.target.value;
            this.renderLogoCanvas();
        });

        // Version select (in logo step)
        document.getElementById('versionSelect').addEventListener('change', () => {
            this.generateQR();
            if (this.state.currentStep === 2) {
                this.renderLogoCanvas();
            } else if (this.state.currentStep === 3) {
                this.renderMainCanvas();
            }
        });

        // ECC level select (in logo step)
        document.getElementById('eccSelect').addEventListener('change', () => {
            this.generateQR();
            if (this.state.currentStep === 2) {
                this.renderLogoCanvas();
            } else if (this.state.currentStep === 3) {
                this.renderMainCanvas();
            }
        });

        // Logo dragging
        this.setupLogoDragging(logoCanvas);
    },

    // Auto-detect best background fill based on logo
    autoDetectBackgroundFill() {
        if (!QRRenderer.state.logoImageData) return;

        const data = QRRenderer.state.logoImageData.data;
        let hasTransparency = false;
        let totalLuminance = 0;
        let opaquePixels = 0;

        // Sample every 16th pixel for performance
        for (let i = 0; i < data.length; i += 64) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a < 128) {
                hasTransparency = true;
            } else {
                totalLuminance += (0.299 * r + 0.587 * g + 0.114 * b);
                opaquePixels++;
            }
        }

        const avgLuminance = opaquePixels > 0 ? totalLuminance / opaquePixels : 128;

        let fill = 'light';
        if (avgLuminance < 85) {
            fill = 'dark';
        } else {
            fill = 'light';
        }

        QRRenderer.state.backgroundFill = fill;
        document.getElementById('backgroundFill').value = fill;
    },

    // Setup logo drag functionality
    setupLogoDragging(canvas) {
        const getMousePos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        };

        canvas.addEventListener('mousedown', (e) => {
            if (this.state.interactionMode === 'paint') {
                this.handlePaintStart(e);
                return;
            }
            if (!QRRenderer.state.logoImg) return;

            this.state.isDragging = true;
            this.state.dragStartX = e.clientX;
            this.state.dragStartY = e.clientY;
            this.state.logoStartX = QRRenderer.state.logoX;
            this.state.logoStartY = QRRenderer.state.logoY;
            canvas.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.state.isDragging) return;

            const canvas = document.getElementById('logoCanvas');
            const rect = canvas.getBoundingClientRect();

            // Calculate movement as percentage of canvas
            const deltaX = (e.clientX - this.state.dragStartX) / rect.width * 100;
            const deltaY = (e.clientY - this.state.dragStartY) / rect.height * 100;

            // Update logo position (clamped to 0-100)
            QRRenderer.state.logoX = Math.max(0, Math.min(100, this.state.logoStartX + deltaX));
            QRRenderer.state.logoY = Math.max(0, Math.min(100, this.state.logoStartY + deltaY));

            this.renderLogoCanvas();
        });

        document.addEventListener('mouseup', () => {
            if (this.state.isDragging) {
                this.state.isDragging = false;
                const canvas = document.getElementById('logoCanvas');
                canvas.classList.remove('dragging');
            }
        });

        // Touch support
        canvas.addEventListener('touchstart', (e) => {
            if (this.state.interactionMode === 'paint') {
                this.handlePaintStart(e.touches[0]);
                e.preventDefault();
                return;
            }
            if (!QRRenderer.state.logoImg) return;

            const touch = e.touches[0];
            this.state.isDragging = true;
            this.state.dragStartX = touch.clientX;
            this.state.dragStartY = touch.clientY;
            this.state.logoStartX = QRRenderer.state.logoX;
            this.state.logoStartY = QRRenderer.state.logoY;
            canvas.classList.add('dragging');
            e.preventDefault();
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (!this.state.isDragging) return;

            const touch = e.touches[0];
            const canvas = document.getElementById('logoCanvas');
            const rect = canvas.getBoundingClientRect();

            const deltaX = (touch.clientX - this.state.dragStartX) / rect.width * 100;
            const deltaY = (touch.clientY - this.state.dragStartY) / rect.height * 100;

            QRRenderer.state.logoX = Math.max(0, Math.min(100, this.state.logoStartX + deltaX));
            QRRenderer.state.logoY = Math.max(0, Math.min(100, this.state.logoStartY + deltaY));

            this.renderLogoCanvas();
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (this.state.isDragging) {
                this.state.isDragging = false;
                const canvas = document.getElementById('logoCanvas');
                canvas.classList.remove('dragging');
            }
        });
    },

    // Render logo canvas (step 2) - transparent modules or paint mode
    renderLogoCanvas() {
        const canvas = document.getElementById('logoCanvas');
        if (!canvas || !this.state.matrix) return;

        if (this.state.interactionMode === 'paint') {
            QRRenderer.renderForPainting(
                canvas, this.state.matrix, this.state.version,
                this.state.editableCells, this.state.paddingEdits, 0.4
            );
        } else {
            QRRenderer.renderWithTransparency(canvas, this.state.matrix, this.state.version, 0.4);
        }
    },

    // Render main canvas with full styling (step 3)
    renderMainCanvas() {
        const canvas = document.getElementById('mainCanvas');
        if (!canvas || !this.state.matrix) return;

        QRRenderer.render(canvas, this.state.matrix, this.state.version);
    },

    // Setup style controls (step 3)
    setupStyleControls() {
        // Module shape (exclude finder shape buttons)
        document.querySelectorAll('.shape-btn:not(.finder-shape-btn)').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.shape-btn:not(.finder-shape-btn)').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                QRRenderer.state.moduleShape = btn.dataset.shape;
                this.renderMainCanvas();
            });
        });

        // Finder shape buttons
        document.querySelectorAll('.finder-shape-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.finder-shape-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                QRRenderer.state.finderShape = btn.dataset.finder;
                this.renderMainCanvas();
            });
        });

        // Finder color pickers
        document.getElementById('finderOuterColor').addEventListener('input', (e) => {
            QRRenderer.state.finderOuterColor = e.target.value;
            this.renderMainCanvas();
        });
        document.getElementById('finderMiddleColor').addEventListener('input', (e) => {
            QRRenderer.state.finderMiddleColor = e.target.value;
            this.renderMainCanvas();
        });
        document.getElementById('finderCenterColor').addEventListener('input', (e) => {
            QRRenderer.state.finderCenterColor = e.target.value;
            this.renderMainCanvas();
        });

        // Full-sized separator checkbox
        document.getElementById('finderFullSeparator').addEventListener('change', (e) => {
            QRRenderer.state.finderFullSeparator = e.target.checked;
            this.renderMainCanvas();
        });

        // Simple color pickers (no logo mode)
        document.getElementById('simpleDarkColor').addEventListener('input', (e) => {
            QRRenderer.state.simpleDarkColor = e.target.value;
            this.renderMainCanvas();
        });
        document.getElementById('simpleLightColor').addEventListener('input', (e) => {
            QRRenderer.state.simpleLightColor = e.target.value;
            this.renderMainCanvas();
        });

        // Module color mode (shown when logo is loaded)
        document.getElementById('colorMode').addEventListener('change', (e) => {
            QRRenderer.state.colorMode = e.target.value;

            const paletteDisplay = document.getElementById('paletteDisplay');
            const gradientControls = document.getElementById('gradientControls');

            if (e.target.value === 'palette') {
                this.displayPalette();
                paletteDisplay.style.display = 'block';
                gradientControls.style.display = 'none';
            } else if (e.target.value === 'gradient') {
                paletteDisplay.style.display = 'none';
                gradientControls.style.display = 'block';
            } else {
                paletteDisplay.style.display = 'none';
                gradientControls.style.display = 'none';
            }

            this.renderMainCanvas();
        });

        // Palette color pickers
        document.querySelectorAll('.palette-picker').forEach(input => {
            input.addEventListener('input', (e) => {
                const type = e.target.dataset.type;
                const index = parseInt(e.target.dataset.index);
                if (type === 'dark') {
                    QRRenderer.state.darkPalette[index] = e.target.value;
                } else {
                    QRRenderer.state.lightPalette[index] = e.target.value;
                }
                this.renderMainCanvas();
            });
        });

        // Gradient luminosity sliders
        const darkMaxLum = document.getElementById('darkMaxLum');
        const darkLumValue = document.getElementById('darkLumValue');
        darkMaxLum.addEventListener('input', (e) => {
            QRRenderer.state.darkMaxLuminosity = parseInt(e.target.value);
            darkLumValue.textContent = e.target.value;
            this.renderMainCanvas();
        });

        const lightMinLum = document.getElementById('lightMinLum');
        const lightLumValue = document.getElementById('lightLumValue');
        lightMinLum.addEventListener('input', (e) => {
            QRRenderer.state.lightMinLuminosity = parseInt(e.target.value);
            lightLumValue.textContent = e.target.value;
            this.renderMainCanvas();
        });

        // Background fill (shown when logo is loaded)
        document.getElementById('backgroundFill').addEventListener('change', (e) => {
            QRRenderer.state.backgroundFill = e.target.value;
            if (this.state.currentStep === 2) {
                this.renderLogoCanvas();
            } else {
                this.renderMainCanvas();
            }
        });

        // Module size
        const moduleSize = document.getElementById('moduleSize');
        const moduleSizeValue = document.getElementById('moduleSizeValue');
        moduleSize.addEventListener('input', (e) => {
            QRRenderer.state.moduleSize = parseInt(e.target.value);
            moduleSizeValue.textContent = e.target.value;
            this.renderMainCanvas();
        });

    },

    // Sync palette color picker UI with current QRRenderer palette values
    displayPalette() {
        const pickers = document.querySelectorAll('.palette-picker');
        pickers.forEach(picker => {
            const type = picker.dataset.type;
            const index = parseInt(picker.dataset.index);
            if (type === 'dark') {
                picker.value = QRRenderer.state.darkPalette[index] || '#000000';
            } else {
                picker.value = QRRenderer.state.lightPalette[index] || '#ffffff';
            }
        });
    },

    // Generate QR with a specific mask pattern
    generateQRWithMask(maskPattern) {
        try {
            const content = this.state.qrContent;
            if (!content) return null;

            const version = this.state.version;
            const eccLevel = this.state.eccLevel;
            const mode = this.detectMode(content);

            // Generate bitstream
            const bitstreamData = generateBitstream(content, mode, version, eccLevel, capacityTable);

            // Split into blocks and calculate ECC
            let blocks = splitIntoBlocks(bitstreamData.dataBytes, version, eccLevel, blockSizeTable);
            blocks = calculateEccForBlocks(blocks);

            // Interleave
            const interleaved = interleaveBlocks(blocks);

            // Create matrix
            const size = getQrSize(version);
            const matrix = createMatrix(size);

            // Place patterns and data
            placeFunctionPatterns(matrix, version);
            placeDataBits(matrix, interleaved);
            applyMask(matrix, maskPattern, version);
            placeFormatInfo(matrix, eccLevel, maskPattern, version);
            placeVersionInfo(matrix, version);

            return matrix;
        } catch (e) {
            console.error('QR generation error:', e);
            return null;
        }
    },

    // Count how many modules match the logo's dark/light pattern
    countLogoMatches(matrix) {
        if (!matrix || !QRRenderer.state.logoImg || !QRRenderer.state.logoImageData) {
            return { matches: 0, total: 0 };
        }

        const size = matrix.length;
        const quietZone = QRRenderer.state.quietZone;
        const totalSize = size + (quietZone * 2);
        const canvasSize = 450; // Match logo canvas size
        const moduleSize = canvasSize / totalSize;
        const offset = quietZone * moduleSize;
        const qrAreaSize = size * moduleSize;
        const sampleSize = moduleSize * 0.5;

        let matches = 0;
        let total = 0;

        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                // Sample logo at module center
                const moduleCenterX = (col * moduleSize) + moduleSize / 2;
                const moduleCenterY = (row * moduleSize) + moduleSize / 2;

                const sampledRgba = QRRenderer.sampleLogoDominant(moduleCenterX, moduleCenterY, qrAreaSize, sampleSize);

                // Skip if outside logo or transparent
                if (!sampledRgba || sampledRgba[3] < 128) continue;

                total++;

                // Calculate logo luminance
                const luminance = 0.299 * sampledRgba[0] + 0.587 * sampledRgba[1] + 0.114 * sampledRgba[2];
                const logoWantsDark = luminance < 128;
                const moduleIsDark = matrix[row][col];

                if (logoWantsDark === moduleIsDark) {
                    matches++;
                }
            }
        }

        return { matches, total };
    },

    // ========== PADDING MODULE MAPPING ==========

    // Identify which bytes in the bitstream are padding bytes
    identifyPaddingBytes() {
        const bitstreamData = this.state.bitstreamData;
        if (!bitstreamData) return null;

        // Calculate total message bits (everything before padding)
        const messageBits = bitstreamData.modeIndicator.length +
                           bitstreamData.charCount.length +
                           bitstreamData.messageData.length +
                           bitstreamData.terminator.length +
                           bitstreamData.bytePadding.length;

        const messageBytes = Math.ceil(messageBits / 8);
        const paddingByteCount = bitstreamData.padBytes.length;

        return {
            startByteIndex: messageBytes,
            endByteIndex: messageBytes + paddingByteCount,
            paddingByteIndices: Array.from(
                {length: paddingByteCount},
                (_, i) => messageBytes + i
            )
        };
    },

    // Track padding bytes through block split and interleaving
    trackPaddingThroughInterleaving(paddingByteIndices, blocks) {
        const paddingInBlocks = [];

        let originalDataBytesOffset = 0;

        blocks.forEach((block, blockIdx) => {
            block.data.forEach((byte, localByteIdx) => {
                const originalIndex = originalDataBytesOffset + localByteIdx;

                if (paddingByteIndices.includes(originalIndex)) {
                    const paddingByteIndex = paddingByteIndices.indexOf(originalIndex);

                    paddingInBlocks.push({
                        blockIndex: blockIdx,
                        localByteIndex: localByteIdx,
                        originalDataIndex: originalIndex,
                        paddingByteIndex: paddingByteIndex,
                        value: byte
                    });
                }
            });

            originalDataBytesOffset += block.data.length;
        });

        // Simulate interleaving to find position in interleaved array
        const paddingInInterleaved = [];
        const maxDataLen = Math.max(...blocks.map(b => b.data.length));

        let interleavedIndex = 0;
        for (let i = 0; i < maxDataLen; i++) {
            blocks.forEach((block, blockIdx) => {
                if (i < block.data.length) {
                    const isPadding = paddingInBlocks.find(
                        p => p.blockIndex === blockIdx && p.localByteIndex === i
                    );
                    if (isPadding) {
                        paddingInInterleaved.push({
                            ...isPadding,
                            interleavedIndex
                        });
                    }
                    interleavedIndex++;
                }
            });
        }

        return paddingInInterleaved;
    },

    // Map an interleaved byte index to its module positions in the matrix
    mapInterleavedToModules(interleavedIndex, size, version) {
        const modulePositions = [];
        const startBitIndex = interleavedIndex * 8;

        // Simulate the zigzag placement algorithm
        let bitIndex = 0;
        let direction = -1; // -1 = up, 1 = down
        let col = size - 1;

        while (col >= 1 && modulePositions.length < 8) {
            for (let count = 0; count < size && modulePositions.length < 8; count++) {
                let row = direction === -1 ? size - 1 - count : count;

                for (let c = 0; c < 2 && modulePositions.length < 8; c++) {
                    const currentCol = col - c;

                    // Check if this is a function module (skip if it is)
                    if (!isFunctionModule(row, currentCol, size, version)) {
                        if (bitIndex >= startBitIndex && bitIndex < startBitIndex + 8) {
                            modulePositions.push({
                                row,
                                col: currentCol,
                                bitOffset: bitIndex - startBitIndex
                            });
                        }
                        bitIndex++;
                    }
                }
            }

            col -= 2;
            if (col === 6) col--; // Skip timing column
            direction *= -1;
        }

        return modulePositions;
    },

    // Build complete mapping: padding byte index → module positions
    buildPaddingModuleMap() {
        const bitstreamData = this.state.bitstreamData;
        const blocks = this.state.blocks;
        const version = this.state.version;

        if (!bitstreamData || !blocks || !version) return;

        const size = 21 + (version - 1) * 4;
        const paddingInfo = this.identifyPaddingBytes();
        if (!paddingInfo || paddingInfo.paddingByteIndices.length === 0) {
            this.state.paddingModuleMap = null;
            this.state.editableCells = new Set();
            return;
        }

        const paddingInterleaved = this.trackPaddingThroughInterleaving(
            paddingInfo.paddingByteIndices,
            blocks
        );

        const paddingModuleMap = new Map();

        paddingInterleaved.forEach((padInfo) => {
            const modules = this.mapInterleavedToModules(
                padInfo.interleavedIndex,
                size,
                version
            );
            paddingModuleMap.set(padInfo.paddingByteIndex, modules);
        });

        this.state.paddingModuleMap = paddingModuleMap;

        // Build editable cells set
        this.state.editableCells = new Set();
        paddingModuleMap.forEach((modules) => {
            modules.forEach(m => {
                this.state.editableCells.add(`${m.row},${m.col}`);
            });
        });

        // Store original padding bytes
        this.state.originalPaddingBytes = [...bitstreamData.padBytes];
    },

    // ========== LOGO BLEND TO PADDING ==========

    // Convert padding edits (displayed/masked values) to unmasked byte values
    convertPaddingEditsToBytes(edits, maskPattern) {
        const newPaddingBytes = [...this.state.originalPaddingBytes];
        const paddingModuleMap = this.state.paddingModuleMap;

        paddingModuleMap.forEach((modules, padByteIdx) => {
            // Check if this byte has any edited modules
            const hasEdits = modules.some(module => {
                const cellKey = `${module.row},${module.col}`;
                return edits.has(cellKey);
            });

            if (!hasEdits) {
                return; // Keep original value
            }

            const bits = new Array(8).fill(0);

            modules.forEach((module) => {
                const cellKey = `${module.row},${module.col}`;

                let bitValue;
                if (edits.has(cellKey)) {
                    // This is the masked (displayed) value we want
                    const maskedValue = edits.get(cellKey);
                    const shouldFlip = shouldFlipModule(module.row, module.col, maskPattern);
                    // Unmask to get the raw bit value
                    bitValue = shouldFlip ? !maskedValue : maskedValue;
                } else {
                    // Use original bit value
                    const originalByte = this.state.originalPaddingBytes[padByteIdx];
                    const bitInByte = (originalByte >> (7 - module.bitOffset)) & 1;
                    bitValue = bitInByte === 1;
                }

                bits[module.bitOffset] = bitValue ? 1 : 0;
            });

            // Convert bits to byte
            let byteValue = 0;
            for (let i = 0; i < 8; i++) {
                byteValue = (byteValue << 1) | bits[i];
            }
            newPaddingBytes[padByteIdx] = byteValue;
        });

        return newPaddingBytes;
    },

    // Sample logo at position and determine desired dark/light for padding modules
    getDesiredPaddingEdits(moduleSize, canvasSize, matrixSize, maskPattern) {
        const edits = new Map();
        const editableCells = this.state.editableCells;
        const sampleSize = moduleSize * 0.5;

        editableCells.forEach(cellKey => {
            const [row, col] = cellKey.split(',').map(Number);
            const canvasX = (col + 0.5) * moduleSize;
            const canvasY = (row + 0.5) * moduleSize;

            const sampledRgba = QRRenderer.sampleLogoDominant(canvasX, canvasY, canvasSize, sampleSize);

            if (!sampledRgba || sampledRgba[3] < 128) {
                // Outside logo or transparent - keep current masked value
                return;
            }

            // Match logo luminance
            const sampledLuminance = 0.299 * sampledRgba[0] + 0.587 * sampledRgba[1] + 0.114 * sampledRgba[2];
            const wantsDark = sampledLuminance < 128; // true = dark module

            edits.set(cellKey, wantsDark);
        });

        return edits;
    },

    // Simulate applying a mask with padding modifications to count matches
    simulateMaskWithLogoBlend(maskPattern, desiredColors, moduleSize, canvasSize) {
        const version = this.state.version;
        const size = 21 + (version - 1) * 4;
        const sampleSize = moduleSize * 0.5;

        // Save original dataBytes (includes any baked-in paint edits)
        const originalDataBytes = [...this.state.bitstreamData.dataBytes];

        // Step 1: Get padding edits for this mask pattern
        const testPaddingEdits = new Map();
        const editableCells = this.state.editableCells;

        // Generate matrix from current dataBytes with this mask to preserve painted state
        let testBlocks = splitIntoBlocks([...originalDataBytes], version, this.state.eccLevel, blockSizeTable);
        calculateEccForBlocks(testBlocks);
        let testInterleaved = interleaveBlocks(testBlocks);
        let testMatrix = createMatrix(size);
        placeFunctionPatterns(testMatrix, version);
        placeDataBits(testMatrix, testInterleaved);
        applyMask(testMatrix, maskPattern, version);
        placeFormatInfo(testMatrix, this.state.eccLevel, maskPattern, version);
        placeVersionInfo(testMatrix, version);

        editableCells.forEach(cellKey => {
            const [row, col] = cellKey.split(',').map(Number);
            const canvasX = (col + 0.5) * moduleSize;
            const canvasY = (row + 0.5) * moduleSize;

            const sampledRgba = QRRenderer.sampleLogoDominant(canvasX, canvasY, canvasSize, sampleSize);

            let moduleValue;
            if (!sampledRgba || sampledRgba[3] < 128) {
                // Outside logo or transparent - use backgroundFill setting
                moduleValue = QRRenderer.state.backgroundFill === 'dark';
            } else {
                // Match logo luminance
                const sampledLuminance = 0.299 * sampledRgba[0] + 0.587 * sampledRgba[1] + 0.114 * sampledRgba[2];
                moduleValue = sampledLuminance < 128; // true = dark
            }

            testPaddingEdits.set(cellKey, moduleValue);
        });

        // Step 2: Convert padding edits to unmasked bytes
        const newPaddingBytes = this.convertPaddingEditsToBytes(testPaddingEdits, maskPattern);

        // Step 3: Update dataBytes with new padding
        const paddingInfo = this.identifyPaddingBytes();
        const messageBytes = paddingInfo.startByteIndex;

        const testDataBytes = [...originalDataBytes];
        newPaddingBytes.forEach((byte, idx) => {
            testDataBytes[messageBytes + idx] = byte;
        });

        // Step 4: Recalculate ECC with new padding
        testBlocks = splitIntoBlocks(testDataBytes, version, this.state.eccLevel, blockSizeTable);
        calculateEccForBlocks(testBlocks);

        // Step 5: Regenerate matrix with new data+ECC
        testInterleaved = interleaveBlocks(testBlocks);
        testMatrix = createMatrix(size);
        placeFunctionPatterns(testMatrix, version);
        placeDataBits(testMatrix, testInterleaved);
        applyMask(testMatrix, maskPattern, version);
        placeFormatInfo(testMatrix, this.state.eccLevel, maskPattern, version);
        placeVersionInfo(testMatrix, version);

        // Step 6: Count how many modules match the logo
        let matches = 0;
        desiredColors.forEach((wantsDark, cellKey) => {
            const [row, col] = cellKey.split(',').map(Number);
            const moduleValue = Boolean(testMatrix[row][col]);
            if (moduleValue === wantsDark) {
                matches++;
            }
        });

        return {
            matches: matches,
            paddingBytes: newPaddingBytes,
            paddingEdits: testPaddingEdits
        };
    },

    // Get desired colors for ALL modules based on logo (not just padding)
    getDesiredLogoColors(moduleSize, canvasSize, matrixSize) {
        const desiredValues = new Map();
        const sampleSize = moduleSize * 0.5;

        for (let row = 0; row < matrixSize; row++) {
            for (let col = 0; col < matrixSize; col++) {
                const canvasX = (col + 0.5) * moduleSize;
                const canvasY = (row + 0.5) * moduleSize;

                const sampledRgba = QRRenderer.sampleLogoDominant(canvasX, canvasY, canvasSize, sampleSize);

                if (!sampledRgba) continue;

                const alpha = sampledRgba[3];
                if (alpha < 128) continue;

                // Determine if the logo wants this to be dark or light
                const sampledLuminance = 0.299 * sampledRgba[0] + 0.587 * sampledRgba[1] + 0.114 * sampledRgba[2];
                const wantsDark = sampledLuminance < 128;

                desiredValues.set(`${row},${col}`, wantsDark);
            }
        }

        return desiredValues;
    },

    // Apply logo blend to padding - modifies actual padding bytes
    applyLogoBlendToPadding() {
        if (!QRRenderer.state.logoImg || !QRRenderer.state.logoImageData) {
            return { success: false, message: 'Please upload a logo first.' };
        }

        if (!this.state.paddingModuleMap || this.state.editableCells.size === 0) {
            return { success: false, message: 'No padding modules available to modify.' };
        }

        const size = this.state.matrix.length;
        const quietZone = QRRenderer.state.quietZone;
        const totalSize = size + (quietZone * 2);
        const canvasSize = 450; // Match logo canvas size
        const moduleSize = canvasSize / totalSize;
        const qrAreaSize = size * moduleSize;

        // Get desired colors for ALL modules based on logo
        const desiredColors = this.getDesiredLogoColors(moduleSize, qrAreaSize, size);

        if (desiredColors.size === 0) {
            return { success: false, message: 'No modules inside logo area to optimize.' };
        }

        // Test all 8 mask patterns
        const scores = [];
        let bestResult = null;

        for (let maskPattern = 0; maskPattern < 8; maskPattern++) {
            const result = this.simulateMaskWithLogoBlend(maskPattern, desiredColors, moduleSize, qrAreaSize);

            const score = {
                mask: maskPattern,
                matches: result.matches,
                total: desiredColors.size,
                percentage: Math.round((result.matches / desiredColors.size) * 100),
                paddingBytes: result.paddingBytes,
                paddingEdits: result.paddingEdits
            };

            scores.push(score);

            if (!bestResult || result.matches > bestResult.matches) {
                bestResult = score;
            }
        }

        const selectedMask = bestResult.mask;

        // Apply the best mask and padding modifications
        const paddingInfo = this.identifyPaddingBytes();
        const messageBytes = paddingInfo.startByteIndex;

        // Update dataBytes with new padding
        bestResult.paddingBytes.forEach((byte, idx) => {
            this.state.bitstreamData.dataBytes[messageBytes + idx] = byte;
        });
        this.state.bitstreamData.padBytes = [...bestResult.paddingBytes];

        // Recalculate ECC
        const blocks = splitIntoBlocks(this.state.bitstreamData.dataBytes, this.state.version, this.state.eccLevel, blockSizeTable);
        calculateEccForBlocks(blocks);
        this.state.blocks = blocks;

        // Regenerate matrix with new data+ECC and best mask
        const interleaved = interleaveBlocks(blocks);
        const newMatrix = createMatrix(size);
        placeFunctionPatterns(newMatrix, this.state.version);
        placeDataBits(newMatrix, interleaved);
        applyMask(newMatrix, selectedMask, this.state.version);
        placeFormatInfo(newMatrix, this.state.eccLevel, selectedMask, this.state.version);
        placeVersionInfo(newMatrix, this.state.version);

        this.state.matrix = newMatrix;
        this.state.maskPattern = selectedMask;

        // Update original padding bytes for future modifications
        this.state.originalPaddingBytes = [...bestResult.paddingBytes];

        return {
            success: true,
            bestMask: selectedMask,
            matches: bestResult.matches,
            total: desiredColors.size,
            percentage: bestResult.percentage,
            scores: scores
        };
    },

    // ========== PAINT MODE ==========

    // Setup paint mode controls and event handlers
    setupPaintMode() {
        const canvas = document.getElementById('logoCanvas');

        // Mode toggle buttons
        document.querySelectorAll('#paintModeControls .mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                const mode = btn.dataset.mode;
                this.state.interactionMode = mode;

                // Update toggle active state
                document.querySelectorAll('#paintModeControls .mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Show/hide brush controls
                const brushControls = document.getElementById('brushControls');
                brushControls.style.display = mode === 'paint' ? 'flex' : 'none';

                // Update mode hint
                const modeHint = document.getElementById('modeHint');
                if (modeHint) {
                    modeHint.textContent = mode === 'paint' ? 'Click to paint, Shift+drag to fill area' : 'Drag to move logo';
                }

                // Toggle canvas CSS class
                canvas.classList.toggle('paint-mode', mode === 'paint');
                canvas.classList.toggle('draggable', mode === 'logo' && !!QRRenderer.state.logoImg);

                this.renderLogoCanvas();
            });
        });

        // Brush buttons
        document.querySelectorAll('.brush-btn[data-brush]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.brushMode = btn.dataset.brush;
                document.querySelectorAll('.brush-btn[data-brush]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Reset button
        document.getElementById('resetPaintBtn').addEventListener('click', () => {
            this.state.paddingEdits = new Map();
            this.updateQRFromPaddingEdits();
            this.renderLogoCanvas();
        });

        // Canvas paint event handlers
        canvas.addEventListener('mousemove', (e) => {
            if (this.state.interactionMode !== 'paint') return;
            if (this.state.isBoxSelecting) {
                const cell = this.canvasEventToCell(e);
                if (cell) {
                    this.state.boxSelectEnd = cell;
                    this.renderLogoCanvas();
                    this.drawBoxSelection();
                }
            } else if (this.state.isPaintingModule) {
                this.paintModuleAt(e);
            } else {
                this.highlightModuleAt(e);
            }
        });

        canvas.addEventListener('mouseup', () => {
            if (this.state.isBoxSelecting) {
                this.applyBoxSelection();
                this.state.isBoxSelecting = false;
                this.state.boxSelectStart = null;
                this.state.boxSelectEnd = null;
                this.renderLogoCanvas();
            } else if (this.state.isPaintingModule) {
                this.state.isPaintingModule = false;
                this.schedulePaintUpdate();
            }
        });

        canvas.addEventListener('mouseleave', () => {
            if (this.state.isBoxSelecting) {
                this.applyBoxSelection();
                this.state.isBoxSelecting = false;
                this.state.boxSelectStart = null;
                this.state.boxSelectEnd = null;
                this.renderLogoCanvas();
            } else if (this.state.isPaintingModule) {
                this.state.isPaintingModule = false;
                this.schedulePaintUpdate();
            }
            if (this.state.lastHighlightCell !== null) {
                this.state.lastHighlightCell = null;
                this.renderLogoCanvas();
            }
        });

        // Touch equivalents on canvas
        canvas.addEventListener('touchmove', (e) => {
            if (this.state.interactionMode !== 'paint') return;
            if (this.state.isPaintingModule) {
                this.paintModuleAt(e.touches[0]);
                e.preventDefault();
            }
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            if (this.state.isPaintingModule) {
                this.state.isPaintingModule = false;
                this.schedulePaintUpdate();
            }
        });
    },

    // Convert mouse/touch event to grid (row, col)
    canvasEventToCell(e) {
        const canvas = document.getElementById('logoCanvas');
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const px = (e.clientX - rect.left) * scaleX;
        const py = (e.clientY - rect.top) * scaleY;

        const size = this.state.matrix.length;
        const quietZone = QRRenderer.state.quietZone;
        const totalSize = size + (quietZone * 2);
        const moduleSize = canvas.width / totalSize;
        const offset = quietZone * moduleSize;

        const col = Math.floor((px - offset) / moduleSize);
        const row = Math.floor((py - offset) / moduleSize);

        if (row < 0 || row >= size || col < 0 || col >= size) return null;
        return { row, col };
    },

    // Handle paint start (mousedown/touchstart in paint mode)
    handlePaintStart(e) {
        if (!this.state.matrix) return;

        if (e.shiftKey) {
            // Start box selection
            const cell = this.canvasEventToCell(e);
            if (cell) {
                this.state.isBoxSelecting = true;
                this.state.boxSelectStart = cell;
                this.state.boxSelectEnd = cell;
            }
        } else {
            this.state.isPaintingModule = true;
            this.paintModuleAt(e);
        }
        if (e.preventDefault) e.preventDefault();
    },

    // Paint a module at the event position
    paintModuleAt(e) {
        const cell = this.canvasEventToCell(e);
        if (!cell) return;

        const cellKey = `${cell.row},${cell.col}`;
        if (!this.state.editableCells.has(cellKey)) return;

        const wantDark = this.state.brushMode === 'black';
        this.state.paddingEdits.set(cellKey, wantDark);

        // Immediate visual feedback: re-render
        this.renderLogoCanvas();
    },

    // Highlight an editable cell on hover
    highlightModuleAt(e) {
        const cell = this.canvasEventToCell(e);
        const cellKey = cell ? `${cell.row},${cell.col}` : null;

        if (cellKey === this.state.lastHighlightCell) return;
        this.state.lastHighlightCell = cellKey;

        this.renderLogoCanvas();

        if (cell && this.state.editableCells.has(cellKey)) {
            const canvas = document.getElementById('logoCanvas');
            const size = this.state.matrix.length;
            QRRenderer.drawCellHighlight(canvas, cell.row, cell.col, size, QRRenderer.state.quietZone);
        }
    },

    // Draw box selection overlay on the canvas
    drawBoxSelection() {
        const start = this.state.boxSelectStart;
        const end = this.state.boxSelectEnd;
        if (!start || !end) return;

        const canvas = document.getElementById('logoCanvas');
        const ctx = canvas.getContext('2d');
        const size = this.state.matrix.length;
        const quietZone = QRRenderer.state.quietZone;
        const totalSize = size + (quietZone * 2);
        const moduleSize = canvas.width / totalSize;
        const offset = quietZone * moduleSize;

        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);

        const x = offset + minCol * moduleSize;
        const y = offset + minRow * moduleSize;
        const w = (maxCol - minCol + 1) * moduleSize;
        const h = (maxRow - minRow + 1) * moduleSize;

        ctx.fillStyle = 'rgba(74, 158, 255, 0.2)';
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
    },

    // Apply box selection: paint all editable cells in the rectangle
    applyBoxSelection() {
        const start = this.state.boxSelectStart;
        const end = this.state.boxSelectEnd;
        if (!start || !end) return;

        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);

        const wantDark = this.state.brushMode === 'black';
        let editCount = 0;

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cellKey = `${row},${col}`;
                if (this.state.editableCells.has(cellKey)) {
                    this.state.paddingEdits.set(cellKey, wantDark);
                    editCount++;
                }
            }
        }

        if (editCount > 0) {
            this.schedulePaintUpdate();
        }
    },

    // Schedule debounced ECC recalculation after painting
    schedulePaintUpdate() {
        clearTimeout(this.state.paintUpdateTimeout);
        this.state.paintUpdateTimeout = setTimeout(() => {
            this.updateQRFromPaddingEdits();
        }, 100);
    },

    // Apply padding edits to the QR matrix (full pipeline)
    updateQRFromPaddingEdits() {
        if (this.state.paddingEdits.size === 0) return;
        if (!this.state.paddingModuleMap || !this.state.bitstreamData) return;

        const version = this.state.version;
        const eccLevel = this.state.eccLevel;
        const maskPattern = this.state.maskPattern;
        const size = this.state.matrix.length;

        // 1. Convert painted edits to unmasked bytes
        const newPaddingBytes = this.convertPaddingEditsToBytes(this.state.paddingEdits, maskPattern);

        // 2. Update bitstreamData.dataBytes with new padding bytes
        const paddingInfo = this.identifyPaddingBytes();
        const messageBytes = paddingInfo.startByteIndex;

        newPaddingBytes.forEach((byte, idx) => {
            this.state.bitstreamData.dataBytes[messageBytes + idx] = byte;
        });
        this.state.bitstreamData.padBytes = [...newPaddingBytes];

        // 3. Recalculate ECC
        let blocks = splitIntoBlocks(this.state.bitstreamData.dataBytes, version, eccLevel, blockSizeTable);
        blocks = calculateEccForBlocks(blocks);
        this.state.blocks = blocks;

        // 4. Regenerate matrix
        const interleaved = interleaveBlocks(blocks);
        const matrix = createMatrix(size);
        placeFunctionPatterns(matrix, version);
        placeDataBits(matrix, interleaved);
        applyMask(matrix, maskPattern, version);
        placeFormatInfo(matrix, eccLevel, maskPattern, version);
        placeVersionInfo(matrix, version);

        // 5. Update state
        this.state.matrix = matrix;
        this.state.originalPaddingBytes = [...newPaddingBytes];

        // 6. Clear paddingEdits (now baked in)
        this.state.paddingEdits = new Map();

        // 7. Re-render
        this.renderLogoCanvas();
    },

    // Show/hide paint mode controls based on editable cells
    updatePaintControlsVisibility() {
        const controls = document.getElementById('paintModeControls');
        if (!controls) return;
        controls.style.display = this.state.editableCells.size > 0 ? 'flex' : 'none';
    },

    // Reset paint mode UI to logo mode
    resetPaintModeUI() {
        this.state.interactionMode = 'paint';
        this.state.paddingEdits = new Map();
        this.state.isPaintingModule = false;
        this.state.lastHighlightCell = null;
        clearTimeout(this.state.paintUpdateTimeout);

        // Reset toggle buttons - default to paint mode
        document.querySelectorAll('#paintModeControls .mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === 'paint');
        });

        // Show brush controls (paint mode is default)
        const brushControls = document.getElementById('brushControls');
        if (brushControls) brushControls.style.display = 'flex';

        // Set canvas class for paint mode
        const canvas = document.getElementById('logoCanvas');
        if (canvas) {
            canvas.classList.add('paint-mode');
            canvas.classList.remove('draggable');
        }

        // Disable Move Logo button if no logo loaded
        const moveLogoBtn = document.getElementById('moveLogoBtn');
        if (moveLogoBtn) {
            moveLogoBtn.disabled = !QRRenderer.state.logoImg;
        }

        this.updatePaintControlsVisibility();
    },

    // ========== DELETE STEP (Step 4) ==========

    // Interleave blocks with tracking info for codeword mapping
    interleaveBlocksWithTracking(blocks) {
        const result = [];
        const maxDataLen = Math.max(...blocks.map(b => b.data.length));
        const maxEccLen = Math.max(...blocks.map(b => b.ecc.length));

        // Interleave data bytes
        for (let i = 0; i < maxDataLen; i++) {
            blocks.forEach((block, blockIndex) => {
                if (i < block.data.length) {
                    result.push({ value: block.data[i], blockIndex, isEcc: false });
                }
            });
        }

        // Interleave ECC bytes
        for (let i = 0; i < maxEccLen; i++) {
            blocks.forEach((block, blockIndex) => {
                if (i < block.ecc.length) {
                    result.push({ value: block.ecc[i], blockIndex, isEcc: true });
                }
            });
        }

        return result;
    },

    // Get the module position for a given bit index in the interleaved bitstream
    getModulePositionForBit(bitIndex, size, version) {
        let bitCounter = 0;
        let col = size - 1;
        let direction = -1;

        while (col >= 0) {
            if (col === 6) { col--; continue; }

            for (let row = (direction === -1 ? size - 1 : 0);
                 direction === -1 ? row >= 0 : row < size;
                 row += direction) {

                // Right column
                if (!isFunctionModule(row, col, size, version)) {
                    if (bitCounter === bitIndex) return { row, col };
                    bitCounter++;
                }

                // Left column
                if (!isFunctionModule(row, col - 1, size, version)) {
                    if (bitCounter === bitIndex) return { row, col: col - 1 };
                    bitCounter++;
                }
            }

            col -= 2;
            direction *= -1;
        }

        return null;
    },

    // Build codeword map from blocks
    buildCodewordMap() {
        const blocks = this.state.blocks;
        const version = this.state.version;
        if (!blocks || !version || !this.state.matrix) return;

        const size = this.state.matrix.length;
        const ds = this.state.deleteState;

        // Build block info
        ds.blockInfo = blocks.map((block, index) => ({
            dataCount: block.data.length,
            eccCount: block.eccCount,
            deletedCount: 0,
            color: ds.blockColors[index % ds.blockColors.length]
        }));

        // Interleave all bytes with tracking
        const interleaved = this.interleaveBlocksWithTracking(blocks);
        ds.totalCodewords = interleaved.length;

        // Build codeword map: index → {positions, blockIndex, isEcc, byteValue}
        const codewordMap = new Map();
        const reverseMap = new Map();

        for (let cwIdx = 0; cwIdx < interleaved.length; cwIdx++) {
            const item = interleaved[cwIdx];
            const positions = [];
            const bitOffset = cwIdx * 8;

            for (let bit = 0; bit < 8; bit++) {
                const pos = this.getModulePositionForBit(bitOffset + bit, size, version);
                if (pos) positions.push(pos);
            }

            codewordMap.set(cwIdx, {
                positions,
                blockIndex: item.blockIndex,
                isEcc: item.isEcc,
                byteValue: item.value
            });

            // Build reverse map for fast lookup
            positions.forEach(pos => {
                reverseMap.set(`${pos.row},${pos.col}`, cwIdx);
            });
        }

        ds.codewordMap = codewordMap;
        ds.reverseMap = reverseMap;

        // Recount deletions per block
        this.refreshDeleteBlockCounts();
    },

    // Get codeword index for a module position via reverse map
    getCodewordIndexForModule(row, col) {
        const ds = this.state.deleteState;
        if (!ds.reverseMap) return null;
        const cwIdx = ds.reverseMap.get(`${row},${col}`);
        return cwIdx !== undefined ? cwIdx : null;
    },

    // Get block index for a codeword
    getBlockIndexForCodeword(cwIdx) {
        const ds = this.state.deleteState;
        if (!ds.codewordMap) return null;
        const data = ds.codewordMap.get(cwIdx);
        return data ? data.blockIndex : null;
    },

    // Check if a codeword is ECC
    isEccCodeword(cwIdx) {
        const ds = this.state.deleteState;
        if (!ds.codewordMap) return false;
        const data = ds.codewordMap.get(cwIdx);
        return data ? data.isEcc : false;
    },

    // Refresh block deleted counts from the set
    refreshDeleteBlockCounts() {
        const ds = this.state.deleteState;
        if (!ds.blockInfo) return;
        ds.blockInfo.forEach(block => { block.deletedCount = 0; });

        ds.deletedCodewords.forEach(cwIdx => {
            const blockIndex = this.getBlockIndexForCodeword(cwIdx);
            if (blockIndex !== null && ds.blockInfo[blockIndex]) {
                ds.blockInfo[blockIndex].deletedCount++;
            }
        });
    },

    // Render the delete canvas (Step 4)
    renderDeleteCanvas() {
        const canvas = document.getElementById('deleteCanvas');
        if (!canvas || !this.state.matrix) return;

        QRRenderer.renderWithDeletion(
            canvas,
            this.state.matrix,
            this.state.version,
            this.state.deleteState,
            { showOverlays: !this.state.deleteState.hideOverlays }
        );
    },

    // Setup delete step: event handlers, reset, export
    setupDeleteStep() {
        const canvas = document.getElementById('deleteCanvas');
        if (!canvas) return;

        const ds = this.state.deleteState;

        // Mode toggle buttons
        document.querySelectorAll('#deletePaintModeControls .mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                ds.interactionMode = mode;

                document.querySelectorAll('#deletePaintModeControls .mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const brushControls = document.getElementById('deleteBrushControls');
                brushControls.style.display = mode === 'paint' ? 'flex' : 'none';

                const modeHint = document.getElementById('deleteModeHint');
                if (modeHint) {
                    modeHint.textContent = mode === 'paint'
                        ? 'Click to paint, Shift+drag to fill area'
                        : 'Click to delete/restore codewords';
                }

                this.renderDeleteCanvas();
            });
        });

        // Brush buttons
        document.querySelectorAll('#deleteBrushControls .brush-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                ds.brushMode = btn.dataset.brush;
                document.querySelectorAll('#deleteBrushControls .brush-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Helper to get cell from event
        const getCellFromEvent = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const px = (e.clientX - rect.left) * scaleX;
            const py = (e.clientY - rect.top) * scaleY;

            const size = this.state.matrix.length;
            const quietZone = QRRenderer.state.quietZone;
            const totalSize = size + (quietZone * 2);
            const moduleSize = canvas.width / totalSize;
            const offset = quietZone * moduleSize;

            const col = Math.floor((px - offset) / moduleSize);
            const row = Math.floor((py - offset) / moduleSize);

            if (row < 0 || row >= size || col < 0 || col >= size) return null;
            return { row, col };
        };

        // Check if a cell is part of a deleted codeword
        const isDeletedCell = (row, col) => {
            const cwIdx = this.getCodewordIndexForModule(row, col);
            return cwIdx !== null && ds.deletedCodewords.has(cwIdx);
        };

        // Paint a deleted module
        const paintDeletedModule = (row, col) => {
            if (!isDeletedCell(row, col)) return false;
            const cellKey = `${row},${col}`;
            const wantDark = ds.brushMode === 'black';
            ds.deletedModuleEdits.set(cellKey, wantDark);
            return true;
        };

        // Mousedown
        canvas.addEventListener('mousedown', (e) => {
            if (!this.state.matrix) return;

            if (ds.interactionMode === 'paint') {
                const cell = getCellFromEvent(e);
                if (!cell) return;

                if (e.shiftKey) {
                    ds.isBoxSelecting = true;
                    ds.boxSelectStart = cell;
                    ds.boxSelectEnd = cell;
                } else {
                    ds.isPainting = true;
                    paintDeletedModule(cell.row, cell.col);
                    this.renderDeleteCanvas();
                }
                e.preventDefault();
            }
        });

        // Mousemove
        canvas.addEventListener('mousemove', (e) => {
            if (!this.state.matrix || !ds.reverseMap) return;

            if (ds.interactionMode === 'paint') {
                if (ds.isBoxSelecting) {
                    const cell = getCellFromEvent(e);
                    if (cell) {
                        ds.boxSelectEnd = cell;
                        this.renderDeleteCanvas();
                        this.drawDeleteBoxSelection();
                    }
                } else if (ds.isPainting) {
                    const cell = getCellFromEvent(e);
                    if (cell && paintDeletedModule(cell.row, cell.col)) {
                        this.renderDeleteCanvas();
                    }
                }
                return;
            }

            // Delete mode: hover highlighting
            const cell = getCellFromEvent(e);
            if (cell) {
                const cwIdx = this.getCodewordIndexForModule(cell.row, cell.col);
                const blockIdx = cwIdx !== null ? this.getBlockIndexForCodeword(cwIdx) : null;

                if (cwIdx !== ds.hoveredCodewordIndex || blockIdx !== ds.hoveredBlockIndex) {
                    ds.hoveredCodewordIndex = cwIdx;
                    ds.hoveredBlockIndex = blockIdx;
                    this.updateDeleteHoverIndicator();
                    this.renderDeleteCanvas();
                }
            }
        });

        // Mouseup
        canvas.addEventListener('mouseup', () => {
            if (ds.isBoxSelecting) {
                this.applyDeleteBoxSelection();
                ds.isBoxSelecting = false;
                ds.boxSelectStart = null;
                ds.boxSelectEnd = null;
                this.renderDeleteCanvas();
            }
            ds.isPainting = false;
        });

        // Mouseleave
        canvas.addEventListener('mouseleave', () => {
            if (ds.isBoxSelecting) {
                this.applyDeleteBoxSelection();
                ds.isBoxSelecting = false;
                ds.boxSelectStart = null;
                ds.boxSelectEnd = null;
            }
            ds.isPainting = false;
            ds.hoveredCodewordIndex = null;
            ds.hoveredBlockIndex = null;
            this.updateDeleteHoverIndicator();
            this.renderDeleteCanvas();
        });

        // Click (for delete mode)
        canvas.addEventListener('click', (e) => {
            if (!this.state.matrix || !ds.reverseMap) return;
            if (ds.interactionMode !== 'delete') return;

            const cell = getCellFromEvent(e);
            if (!cell) return;

            const cwIdx = this.getCodewordIndexForModule(cell.row, cell.col);
            if (cwIdx === null) return;

            const blockIndex = this.getBlockIndexForCodeword(cwIdx);

            if (ds.deletedCodewords.has(cwIdx)) {
                ds.deletedCodewords.delete(cwIdx);
                // Clear any module edits for this codeword
                const cwData = ds.codewordMap.get(cwIdx);
                if (cwData) {
                    cwData.positions.forEach(pos => {
                        ds.deletedModuleEdits.delete(`${pos.row},${pos.col}`);
                    });
                }
                if (blockIndex !== null && ds.blockInfo[blockIndex]) {
                    ds.blockInfo[blockIndex].deletedCount--;
                }
            } else {
                if (blockIndex !== null && ds.blockInfo[blockIndex]) {
                    const block = ds.blockInfo[blockIndex];
                    const maxErrors = Math.floor(block.eccCount / 2);

                    if (block.deletedCount >= maxErrors) {
                        const msg = `Warning: Block ${blockIndex + 1} is at or beyond error correction capacity!\n\n` +
                            `Max correctable errors: ${maxErrors}\n` +
                            `Currently deleted: ${block.deletedCount}\n\n` +
                            `Deleting more codewords will likely make the QR code unscannable.\n\n` +
                            `Continue anyway?`;
                        if (!confirm(msg)) return;
                    }
                    ds.deletedCodewords.add(cwIdx);
                    block.deletedCount++;
                } else {
                    ds.deletedCodewords.add(cwIdx);
                }
            }

            this.renderDeleteCanvas();
            this.updateDeleteBlockLegend();
        });

        // Reset deletions button
        document.getElementById('resetDeletionsBtn').addEventListener('click', () => {
            if (ds.deletedCodewords.size === 0 && ds.deletedModuleEdits.size === 0) return;

            ds.deletedCodewords.clear();
            ds.deletedModuleEdits.clear();
            if (ds.blockInfo) {
                ds.blockInfo.forEach(block => { block.deletedCount = 0; });
            }

            this.renderDeleteCanvas();
            this.updateDeleteBlockLegend();
        });

        // Export buttons (Step 4)
        document.querySelectorAll('.export-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const size = parseInt(btn.dataset.size);
                this.exportCleanPNG(size);
            });
        });

        // Hide deleted preview checkbox
        document.getElementById('hideDeletedPreview').addEventListener('change', (e) => {
            ds.hideOverlays = e.target.checked;
            this.renderDeleteCanvas();
        });

        // Quiet zone (Step 4)
        const quietZone = document.getElementById('quietZone');
        const quietZoneValue = document.getElementById('quietZoneValue');
        quietZone.addEventListener('input', (e) => {
            QRRenderer.state.quietZone = parseInt(e.target.value);
            quietZoneValue.textContent = e.target.value;
            this.renderDeleteCanvas();
        });
    },

    // Draw box selection overlay on delete canvas
    drawDeleteBoxSelection() {
        const ds = this.state.deleteState;
        const start = ds.boxSelectStart;
        const end = ds.boxSelectEnd;
        if (!start || !end) return;

        const canvas = document.getElementById('deleteCanvas');
        const ctx = canvas.getContext('2d');
        const size = this.state.matrix.length;
        const quietZone = QRRenderer.state.quietZone;
        const totalSize = size + (quietZone * 2);
        const moduleSize = canvas.width / totalSize;
        const offset = quietZone * moduleSize;

        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);

        const x = offset + minCol * moduleSize;
        const y = offset + minRow * moduleSize;
        const w = (maxCol - minCol + 1) * moduleSize;
        const h = (maxRow - minRow + 1) * moduleSize;

        ctx.fillStyle = 'rgba(74, 158, 255, 0.2)';
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
    },

    // Apply box selection to deleted modules
    applyDeleteBoxSelection() {
        const ds = this.state.deleteState;
        const start = ds.boxSelectStart;
        const end = ds.boxSelectEnd;
        if (!start || !end) return;

        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);

        const wantDark = ds.brushMode === 'black';

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cwIdx = this.getCodewordIndexForModule(row, col);
                if (cwIdx !== null && ds.deletedCodewords.has(cwIdx)) {
                    ds.deletedModuleEdits.set(`${row},${col}`, wantDark);
                }
            }
        }
    },

    // Update the block legend in Step 4 side panel
    updateDeleteBlockLegend() {
        const ds = this.state.deleteState;

        // Update summary counts
        const totalEl = document.getElementById('deleteTotalCodewords');
        const deletedEl = document.getElementById('deleteDeletedCount');
        if (totalEl) totalEl.textContent = ds.totalCodewords;
        if (deletedEl) deletedEl.textContent = ds.deletedCodewords.size;

        // Build block legend HTML
        const legend = document.getElementById('deleteBlockLegend');
        if (!legend || !ds.blockInfo.length) {
            if (legend) legend.innerHTML = '';
            return;
        }

        let html = '';
        ds.blockInfo.forEach((block, index) => {
            const maxErrors = Math.floor(block.eccCount / 2);
            const pct = maxErrors > 0 ? Math.min(100, (block.deletedCount / maxErrors) * 100).toFixed(0) : 0;
            const status = this.getBlockDeletionStatus(block.deletedCount, block.eccCount);

            html += `<div class="block-legend-item" style="border-left-color: ${block.color}; background: ${status.bgColor};">
                <div class="block-header">
                    <div>
                        <div class="block-name">Block ${index + 1}</div>
                        <div class="block-counts">${block.dataCount} data + ${block.eccCount} ECC</div>
                    </div>
                    <div class="block-status">
                        <div class="block-status-count" style="color: ${status.color};">${block.deletedCount} / ${maxErrors}</div>
                        <div class="block-status-label" style="color: ${status.color};">${status.label}</div>
                    </div>
                </div>
                <div class="block-progress">
                    <div class="block-progress-bar" style="background: ${status.barColor}; width: ${pct}%;"></div>
                </div>
                <div class="block-max">max correctable: ${maxErrors}</div>
            </div>`;
        });

        legend.innerHTML = html;
    },

    // Update the hover indicator overlay
    updateDeleteHoverIndicator() {
        const indicator = document.getElementById('deleteHoverIndicator');
        if (!indicator) return;

        const ds = this.state.deleteState;

        if (ds.hoveredBlockIndex !== null && ds.blockInfo[ds.hoveredBlockIndex]) {
            const block = ds.blockInfo[ds.hoveredBlockIndex];
            const isEcc = ds.hoveredCodewordIndex !== null && this.isEccCodeword(ds.hoveredCodewordIndex);
            const codewordType = isEcc ? 'ECC' : 'Data';
            const maxErrors = Math.floor(block.eccCount / 2);
            const status = this.getBlockDeletionStatus(block.deletedCount, block.eccCount);

            indicator.style.display = 'block';
            indicator.style.background = status.bgColor;
            indicator.style.borderLeftColor = block.color;
            indicator.innerHTML = `
                <div style="font-weight: bold; color: ${block.color};">Block ${ds.hoveredBlockIndex + 1}</div>
                <div style="font-size: 11px;">${codewordType} Codeword</div>
                <div style="font-size: 11px; color: ${status.color}; font-weight: bold;">${block.deletedCount}/${maxErrors} deleted</div>
                <div style="font-size: 10px; color: ${status.color};">${status.label}</div>
            `;
        } else {
            indicator.style.display = 'none';
        }
    },

    // Get block deletion status (color/label based on ECC capacity)
    getBlockDeletionStatus(deletedCount, eccCount) {
        const maxErrors = Math.floor(eccCount / 2);

        if (deletedCount > maxErrors) {
            return { color: '#d32f2f', bgColor: '#ffcdd2', barColor: '#d32f2f', label: 'OVER LIMIT' };
        } else if (deletedCount === maxErrors) {
            return { color: '#d32f2f', bgColor: '#ffcdd2', barColor: '#d32f2f', label: 'AT LIMIT' };
        } else if (deletedCount >= maxErrors - 2 && maxErrors > 2) {
            return { color: '#f57c00', bgColor: '#fff3e0', barColor: '#ff9800', label: 'WARNING' };
        } else {
            return { color: '#388e3c', bgColor: '#e8f5e9', barColor: '#4caf50', label: 'OK' };
        }
    },

    // Export clean PNG without overlays
    async exportCleanPNG(exportSize) {
        if (!this.state.matrix) return;

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = exportSize;
        exportCanvas.height = exportSize;

        QRRenderer.renderWithDeletion(
            exportCanvas,
            this.state.matrix,
            this.state.version,
            this.state.deleteState,
            { showOverlays: false }
        );

        const defaultName = `qrcode-${exportSize}px.png`;

        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: defaultName,
                    types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }]
                });
                const writable = await handle.createWritable();
                const blob = await new Promise(resolve => exportCanvas.toBlob(resolve, 'image/png'));
                await writable.write(blob);
                await writable.close();
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }

        const dataURL = exportCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = defaultName;
        link.href = dataURL;
        link.click();
    },

    // ========== PROJECT SAVE / LOAD ==========

    // Wire up Load/Save buttons
    setupProjectIO() {
        const loadBtn = document.getElementById('loadProjectBtn');
        const fileInput = document.getElementById('projectFileInput');
        const saveBtn = document.getElementById('saveProjectBtn');

        loadBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    this.restoreProject(data);
                } catch (err) {
                    console.error('Project load error:', err);
                    alert('Invalid project file');
                }
            };
            reader.readAsText(file);
            fileInput.value = '';
        });

        saveBtn.addEventListener('click', () => this.saveProject());
    },

    // Collect all state into JSON and download
    async saveProject() {
        const rs = QRRenderer.state;

        const data = {
            projectVersion: 1,
            savedAt: new Date().toISOString(),
            content: {
                type: this.state.currentType,
                formData: { ...this.state.formData }
            },
            qr: {
                version: document.getElementById('versionSelect').value,
                ecc: document.getElementById('eccSelect').value
            },
            logo: rs.logoImage ? {
                dataUrl: rs.logoImage,
                x: rs.logoX,
                y: rs.logoY,
                scale: rs.logoScale
            } : null,
            style: {
                moduleShape: rs.moduleShape,
                finderShape: rs.finderShape,
                moduleSize: rs.moduleSize,
                colorMode: rs.colorMode,
                darkPalette: [...rs.darkPalette],
                lightPalette: [...rs.lightPalette],
                darkMaxLuminosity: rs.darkMaxLuminosity,
                lightMinLuminosity: rs.lightMinLuminosity,
                finderOuterColor: rs.finderOuterColor,
                finderMiddleColor: rs.finderMiddleColor,
                finderCenterColor: rs.finderCenterColor,
                backgroundFill: rs.backgroundFill,
                quietZone: rs.quietZone,
                finderFullSeparator: rs.finderFullSeparator,
                simpleDarkColor: rs.simpleDarkColor,
                simpleLightColor: rs.simpleLightColor
            },
            deletedCodewords: Array.from(this.state.deleteState.deletedCodewords),
            deletedModuleEdits: Array.from(this.state.deleteState.deletedModuleEdits.entries()),
            maskPattern: this.state.maskPattern,
            padBytes: this.state.bitstreamData ? [...this.state.bitstreamData.padBytes] : null
        };

        const json = JSON.stringify(data, null, 2);
        const defaultName = 'qr-project.json';

        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: defaultName,
                    types: [{ description: 'QR Project File', accept: { 'application/json': ['.json'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(json);
                await writable.close();
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }

        const blob = new Blob([json], { type: 'application/json' });
        const link = document.createElement('a');
        link.download = defaultName;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    },

    // Restore project state from parsed JSON
    restoreProject(data) {
        const rs = QRRenderer.state;

        // (a) Content
        const type = data.content?.type || 'text';
        this.state.currentType = type;
        this.state.formData = { ...data.content?.formData };

        // Update type card active states
        document.querySelectorAll('.type-card').forEach(card => {
            card.classList.toggle('active', card.dataset.type === type);
        });

        // Render form and populate fields
        this.renderForm(type);
        // renderForm clears formData, so restore it again
        this.state.formData = { ...data.content?.formData };

        // Populate form inputs
        const formData = data.content?.formData || {};
        Object.keys(formData).forEach(fieldName => {
            const input = document.querySelector(`[data-field-name="${fieldName}"]`);
            if (!input) return;
            if (input.type === 'checkbox') {
                input.checked = !!formData[fieldName];
            } else {
                input.value = formData[fieldName];
            }
        });

        // (b) QR settings
        if (data.qr) {
            document.getElementById('versionSelect').value = data.qr.version || 'auto';
            document.getElementById('eccSelect').value = data.qr.ecc || 'M';
        }

        // (c) Style
        const style = data.style || {};
        rs.moduleShape = style.moduleShape || 'cushion';
        rs.finderShape = style.finderShape || 'rounded';
        rs.moduleSize = style.moduleSize ?? 80;
        rs.colorMode = style.colorMode || 'palette';
        rs.darkPalette = style.darkPalette || ['#000000', '#333333', '#1a1a1a', '#0d0d0d'];
        rs.lightPalette = style.lightPalette || ['#ffffff', '#f0f0f0', '#e0e0e0', '#d0d0d0'];
        rs.darkMaxLuminosity = style.darkMaxLuminosity ?? 33;
        rs.lightMinLuminosity = style.lightMinLuminosity ?? 66;
        rs.finderOuterColor = style.finderOuterColor || '#000000';
        rs.finderMiddleColor = style.finderMiddleColor || '#ffffff';
        rs.finderCenterColor = style.finderCenterColor || '#000000';
        rs.backgroundFill = style.backgroundFill || 'light';
        rs.quietZone = style.quietZone ?? 2;
        rs.finderFullSeparator = !!style.finderFullSeparator;
        rs.simpleDarkColor = style.simpleDarkColor || '#000000';
        rs.simpleLightColor = style.simpleLightColor || '#ffffff';

        // Update module shape buttons
        document.querySelectorAll('.shape-btn:not(.finder-shape-btn)').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.shape === rs.moduleShape);
        });

        // Update finder shape buttons
        document.querySelectorAll('.finder-shape-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.finder === rs.finderShape);
        });

        // Module size slider
        document.getElementById('moduleSize').value = rs.moduleSize;
        document.getElementById('moduleSizeValue').textContent = rs.moduleSize;

        // Color mode select
        document.getElementById('colorMode').value = rs.colorMode;

        // Show/hide palette vs gradient controls
        const paletteDisplay = document.getElementById('paletteDisplay');
        const gradientControls = document.getElementById('gradientControls');
        paletteDisplay.style.display = rs.colorMode === 'palette' ? 'block' : 'none';
        gradientControls.style.display = rs.colorMode === 'gradient' ? 'block' : 'none';

        // Palette pickers
        this.displayPalette();

        // Gradient sliders
        document.getElementById('darkMaxLum').value = rs.darkMaxLuminosity;
        document.getElementById('darkLumValue').textContent = rs.darkMaxLuminosity;
        document.getElementById('lightMinLum').value = rs.lightMinLuminosity;
        document.getElementById('lightLumValue').textContent = rs.lightMinLuminosity;

        // Finder color pickers
        document.getElementById('finderOuterColor').value = rs.finderOuterColor;
        document.getElementById('finderMiddleColor').value = rs.finderMiddleColor;
        document.getElementById('finderCenterColor').value = rs.finderCenterColor;
        document.getElementById('finderFullSeparator').checked = rs.finderFullSeparator;

        // Simple colors (no logo mode)
        document.getElementById('simpleDarkColor').value = rs.simpleDarkColor;
        document.getElementById('simpleLightColor').value = rs.simpleLightColor;

        // Background fill
        document.getElementById('backgroundFill').value = rs.backgroundFill;

        // Quiet zone
        document.getElementById('quietZone').value = rs.quietZone;
        document.getElementById('quietZoneValue').textContent = rs.quietZone;

        // (d) Logo
        const finishRestore = () => {
            // Cancel any pending debounced update from renderForm
            clearTimeout(this.state.debounceTimer);

            // (e) Generate QR
            this.generateQR();

            // Restore padding modifications and mask pattern if saved
            if (data.padBytes && data.padBytes.length > 0 && this.state.bitstreamData) {
                const paddingInfo = this.identifyPaddingBytes();
                if (paddingInfo && paddingInfo.paddingByteIndices.length === data.padBytes.length) {
                    const messageBytes = paddingInfo.startByteIndex;
                    data.padBytes.forEach((byte, idx) => {
                        this.state.bitstreamData.dataBytes[messageBytes + idx] = byte;
                    });
                    this.state.bitstreamData.padBytes = [...data.padBytes];
                    this.state.originalPaddingBytes = [...data.padBytes];
                    this.state.maskPattern = data.maskPattern ?? 0;

                    // Recalculate ECC and regenerate matrix with saved mask
                    const version = this.state.version;
                    const eccLevel = this.state.eccLevel;
                    const size = this.state.matrix.length;

                    let blocks = splitIntoBlocks(this.state.bitstreamData.dataBytes, version, eccLevel, blockSizeTable);
                    blocks = calculateEccForBlocks(blocks);
                    this.state.blocks = blocks;

                    const interleaved = interleaveBlocks(blocks);
                    const matrix = createMatrix(size);
                    placeFunctionPatterns(matrix, version);
                    placeDataBits(matrix, interleaved);
                    applyMask(matrix, this.state.maskPattern, version);
                    placeFormatInfo(matrix, eccLevel, this.state.maskPattern, version);
                    placeVersionInfo(matrix, version);
                    this.state.matrix = matrix;

                    this.buildPaddingModuleMap();
                }
            }

            this.renderPreview();

            // (f) Deletions — store pending set and module edits
            if (data.deletedCodewords && data.deletedCodewords.length > 0) {
                this.state.deleteState.deletedCodewords = new Set(data.deletedCodewords);
            }
            if (data.deletedModuleEdits && data.deletedModuleEdits.length > 0) {
                this.state.deleteState.deletedModuleEdits = new Map(data.deletedModuleEdits);
            }

            // (g) Navigate to Step 1
            this.goToStep(1);
        };

        if (data.logo && data.logo.dataUrl) {
            const img = new Image();
            img.onload = () => {
                rs.logoImage = data.logo.dataUrl;
                rs.logoImg = img;

                // Build logoImageData via temp canvas
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                tempCtx.drawImage(img, 0, 0);
                rs.logoImageData = tempCtx.getImageData(0, 0, img.width, img.height);

                rs.logoX = data.logo.x ?? 50;
                rs.logoY = data.logo.y ?? 50;
                rs.logoScale = data.logo.scale ?? 100;

                // Show logo UI elements
                document.getElementById('clearLogoBtn').style.display = 'inline-flex';
                document.getElementById('logoAdjustments').style.display = 'block';
                document.getElementById('logoCanvasHint').style.display = 'none';
                document.getElementById('optimizeMaskSection').style.display = 'block';
                document.getElementById('moduleColorMode').style.display = 'block';
                document.getElementById('simpleColorMode').style.display = 'none';
                document.getElementById('backgroundFillGroup').style.display = 'block';

                // Logo scale slider
                document.getElementById('logoScale').value = rs.logoScale;
                document.getElementById('logoScaleValue').textContent = rs.logoScale;

                // Re-show palette if palette mode
                if (rs.colorMode === 'palette') {
                    paletteDisplay.style.display = 'block';
                    this.displayPalette();
                }

                finishRestore();
            };
            img.onerror = () => {
                console.error('Failed to load logo from project file');
                finishRestore();
            };
            img.src = data.logo.dataUrl;
        } else {
            // No logo - use simple color mode
            rs.colorMode = 'simple';
            document.getElementById('simpleColorMode').style.display = 'block';
            document.getElementById('moduleColorMode').style.display = 'none';
            finishRestore();
        }
    },

    // Optimize mask pattern for best logo match (including padding modification)
    optimizeMaskForLogo() {
        if (!QRRenderer.state.logoImg) {
            return;
        }

        // Bake in any pending paint edits so optimization starts from current state
        if (this.state.paddingEdits.size > 0) {
            this.updateQRFromPaddingEdits();
        }

        const resultEl = document.getElementById('optimizeResult');
        resultEl.textContent = 'Testing mask patterns and optimizing padding...';
        resultEl.style.display = 'block';

        // Small delay to allow UI to update
        setTimeout(() => {
            const result = this.applyLogoBlendToPadding();

            if (!result.success) {
                resultEl.textContent = result.message;
                resultEl.style.color = '#6b7280';
                return;
            }

            // Show result
            resultEl.innerHTML = `<strong>Optimized!</strong> Using mask ${result.bestMask} - ${result.matches}/${result.total} modules match logo (${result.percentage}%)`;
            resultEl.style.color = '#10b981';

            // Clear manual edits (optimization replaces them) and rebuild map
            this.state.paddingEdits = new Map();
            this.buildPaddingModuleMap();

            // Clear delete state since matrix changed
            this.state.deleteState.deletedCodewords = new Set();
            this.state.deleteState.deletedModuleEdits = new Map();
            this.state.deleteState.codewordMap = null;
            this.state.deleteState.reverseMap = null;
            this.updatePaintControlsVisibility();

            // Re-render
            this.renderLogoCanvas();
        }, 50);
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
