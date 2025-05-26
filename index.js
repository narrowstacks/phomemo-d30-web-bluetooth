"use strict";

import { drawText } from "https://cdn.jsdelivr.net/npm/canvas-txt@4.1.1/+esm";
import { printCanvas } from "./src/printer.js";
import QRCode from "https://cdn.skypack.dev/qrcode@1.5.3";
import JsBarcode from "https://cdn.skypack.dev/jsbarcode@3.11.6";

const $ = document.querySelector.bind(document);
const $all = document.querySelectorAll.bind(document);

const labelSize = { width: 40, height: 12 };

let uploadedImage = null;
let processedImage = null;
let generatedCode = null; // Generated QR code or barcode image
let previewRotation = -90; // 0, 90, 180, 270 degrees (default: -90 = 90° CCW)
let offsetX = 0; // X offset for print positioning
let offsetY = 0; // Y offset for print positioning

/**
 * Generates a QR code or barcode image based on the current settings
 * @param {string} data - The data to encode
 * @param {string} type - 'qr' or 'barcode'
 * @param {string} format - Barcode format (for barcodes only)
 * @param {string} errorCorrection - QR error correction level (for QR codes only)
 * @returns {Promise<HTMLImageElement>}
 */
const generateCode = async (data, type, format = "CODE128", errorCorrection = "M") => {
	if (!data.trim()) return null;

	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");

	if (type === "qr") {
		// Generate QR code
		try {
			await QRCode.toCanvas(canvas, data, {
				errorCorrectionLevel: errorCorrection,
				type: "image/png",
				quality: 0.92,
				margin: 1,
				color: {
					dark: "#000000",
					light: "#FFFFFF",
				},
				width: 200,
			});
		} catch (err) {
			console.error("QR code generation failed:", err);
			return null;
		}
	} else if (type === "barcode") {
		// Generate barcode
		try {
			// Create a temporary image element for JsBarcode
			const tempImg = document.createElement("img");

			// Generate barcode to the temporary image
			JsBarcode(tempImg, data, {
				format: format,
				width: 2,
				height: 100,
				displayValue: false,
				background: "#FFFFFF",
				lineColor: "#000000",
				margin: 10,
			});

			// Wait for the image to load, then draw it to canvas
			await new Promise((resolve, reject) => {
				tempImg.onload = () => {
					canvas.width = tempImg.width;
					canvas.height = tempImg.height;
					ctx.fillStyle = "#FFFFFF";
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					ctx.drawImage(tempImg, 0, 0);
					resolve();
				};
				tempImg.onerror = reject;
			});
		} catch (err) {
			console.error("Barcode generation failed:", err);
			return null;
		}
	}

	// Convert canvas to image
	const img = new Image();
	img.src = canvas.toDataURL();
	await new Promise((resolve) => {
		img.onload = resolve;
	});

	return img;
};

/**
 * Updates the visual state of rotation buttons and applies CSS rotation to card container.
 * This is purely for preview purposes and does not affect the actual printed output.
 */
const updateRotationButtons = () => {
	const canvas = $("#canvas");
	const card = canvas.closest(".card");

	// Remove all rotation classes from card
	card.classList.remove("rotate-90", "rotate-180", "rotate-270");

	// Apply appropriate rotation class
	// Normalize rotation for CSS classes (CSS doesn't handle negative rotations well)
	const normalizedRotation = ((previewRotation % 360) + 360) % 360;

	switch (normalizedRotation) {
		case 0:
			// No rotation class needed for 0 degrees
			break;
		case 90:
			card.classList.add("rotate-90");
			break;
		case 180:
			card.classList.add("rotate-180");
			break;
		case 270:
			card.classList.add("rotate-270");
			break;
	}
};

/**
 * Applies dithering to image data and returns a 1-bit black/white ImageData.
 * @param {ImageData} imgData
 * @param {"floyd"|"atkinson"|"threshold"} algorithm
 * @param {number} threshold 0-255
 * @param {number} brightness -100 to 100
 * @param {number} contrast -100 to 100
 * @param {number} noise 0-50 (amount of random noise to add)
 * @returns {ImageData}
 */
const ditherImageData = (
	imgData,
	algorithm = "floyd",
	threshold = 128,
	brightness = 0,
	contrast = 0,
	noise = 0
) => {
	const { width, height, data } = imgData;
	const gray = new Float32Array(width * height);

	// Convert brightness and contrast from -100/100 range to usable values
	const brightnessAdjust = brightness * 2.55; // Convert to -255 to 255 range
	const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast)); // Standard contrast formula
	const noiseAmount = noise * 2.55; // Convert noise from 0-50 to 0-127.5 range

	for (let i = 0; i < gray.length; i++) {
		const r = data[i * 4];
		const g = data[i * 4 + 1];
		const b = data[i * 4 + 2];

		// Apply brightness and contrast adjustments to each channel
		let adjustedR = Math.max(0, Math.min(255, contrastFactor * (r - 128) + 128 + brightnessAdjust));
		let adjustedG = Math.max(0, Math.min(255, contrastFactor * (g - 128) + 128 + brightnessAdjust));
		let adjustedB = Math.max(0, Math.min(255, contrastFactor * (b - 128) + 128 + brightnessAdjust));

		// Luminance formula with adjusted values
		let luminance = 0.299 * adjustedR + 0.587 * adjustedG + 0.114 * adjustedB;

		// Add random noise if specified
		if (noise > 0) {
			const randomNoise = (Math.random() - 0.5) * noiseAmount;
			luminance = Math.max(0, Math.min(255, luminance + randomNoise));
		}

		gray[i] = luminance;
	}

	const setBWPixel = (idx, val) => {
		data[idx * 4] = data[idx * 4 + 1] = data[idx * 4 + 2] = val;
		data[idx * 4 + 3] = 255;
	};

	if (algorithm === "threshold") {
		for (let i = 0; i < gray.length; i++) setBWPixel(i, gray[i] < threshold ? 0 : 255);
		return imgData;
	}

	// ----- Ordered dithering (Bayer matrices) -----
	// Supported identifiers: "ordered2", "ordered4", "ordered8"
	if (algorithm.startsWith("ordered")) {
		let matrix;
		if (algorithm === "ordered2") {
			matrix = [
				[0, 2],
				[3, 1],
			];
		} else if (algorithm === "ordered4") {
			matrix = [
				[0, 8, 2, 10],
				[12, 4, 14, 6],
				[3, 11, 1, 9],
				[15, 7, 13, 5],
			];
		} else if (algorithm === "ordered8") {
			matrix = [
				[0, 32, 8, 40, 2, 34, 10, 42],
				[48, 16, 56, 24, 50, 18, 58, 26],
				[12, 44, 4, 36, 14, 46, 6, 38],
				[60, 28, 52, 20, 62, 30, 54, 22],
				[3, 35, 11, 43, 1, 33, 9, 41],
				[51, 19, 59, 27, 49, 17, 57, 25],
				[15, 47, 7, 39, 13, 45, 5, 37],
				[63, 31, 55, 23, 61, 29, 53, 21],
			];
		} else {
			// Default to 4x4 if unknown ordered size specified
			matrix = [
				[0, 8, 2, 10],
				[12, 4, 14, 6],
				[3, 11, 1, 9],
				[15, 7, 13, 5],
			];
		}

		const n = matrix.length;
		const scale = 255 / (n * n);

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const idx = y * width + x;
				const thresholdVal = (matrix[y % n][x % n] + 0.5) * scale;
				setBWPixel(idx, gray[idx] < thresholdVal ? 0 : 255);
			}
		}

		return imgData;
	}

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = y * width + x;
			const oldVal = gray[idx];
			const newVal = oldVal < threshold ? 0 : 255;
			const err = oldVal - newVal;
			gray[idx] = newVal;
			setBWPixel(idx, newVal);

			if (algorithm === "floyd") {
				if (x + 1 < width) gray[idx + 1] += err * (7 / 16);
				if (x - 1 >= 0 && y + 1 < height) gray[idx + width - 1] += err * (3 / 16);
				if (y + 1 < height) gray[idx + width] += err * (5 / 16);
				if (x + 1 < width && y + 1 < height) gray[idx + width + 1] += err * (1 / 16);
			} else if (algorithm === "atkinson") {
				if (x + 1 < width) gray[idx + 1] += err / 8;
				if (x + 2 < width) gray[idx + 2] += err / 8;
				if (y + 1 < height) {
					if (x - 1 >= 0) gray[idx + width - 1] += err / 8;
					gray[idx + width] += err / 8;
					if (x + 1 < width) gray[idx + width + 1] += err / 8;
				}
				if (y + 2 < height) gray[idx + 2 * width] += err / 8;
			}
		}
	}

	return imgData;
};

/**
 * Rotates an image by the specified angle
 * @param {HTMLImageElement|HTMLCanvasElement} image
 * @param {number} angle - Rotation angle in degrees (0, 90, 180, 270, -90, -180, -270)
 * @returns {HTMLCanvasElement}
 */
const rotateImage = (image, angle) => {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");

	// Normalize angle to handle negative values
	const normalizedAngle = ((angle % 360) + 360) % 360;

	// Calculate new dimensions based on rotation
	if (normalizedAngle === 90 || normalizedAngle === 270) {
		canvas.width = image.height;
		canvas.height = image.width;
	} else {
		canvas.width = image.width;
		canvas.height = image.height;
	}

	// Fill with white background
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Apply rotation (use original angle to preserve direction)
	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.rotate((angle * Math.PI) / 180);
	ctx.drawImage(image, -image.width / 2, -image.height / 2);

	return canvas;
};

/**
 * Processes an image with rotation first, then brightness, contrast, and dithering adjustments
 * @param {HTMLImageElement} image
 * @param {number} brightness -100 to 100
 * @param {number} contrast -100 to 100
 * @param {"floyd"|"atkinson"|"threshold"} algorithm
 * @param {number} threshold 0-255
 * @param {number} rotation - Rotation angle in degrees (0, 90, 180, 270)
 * @param {number} noise 0-50 (amount of random noise to add)
 * @returns {HTMLCanvasElement}
 */
const processImageWithAdjustments = (
	image,
	brightness = 0,
	contrast = 0,
	algorithm = "floyd",
	threshold = 128,
	rotation = 0,
	noise = 0
) => {
	// IMPORTANT: Apply rotation FIRST to the original image before any other processing
	// This ensures the rotation happens on the clean original image data
	let rotatedImage = image;
	if (rotation !== 0) {
		rotatedImage = rotateImage(image, rotation);
	}

	// Create a temporary canvas to process the rotated image
	const tempCanvas = document.createElement("canvas");
	const tempCtx = tempCanvas.getContext("2d");

	tempCanvas.width = rotatedImage.width;
	tempCanvas.height = rotatedImage.height;

	// Fill with white background first to handle transparency
	tempCtx.fillStyle = "#ffffff";
	tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

	// Draw the rotated image on top of white background
	tempCtx.drawImage(rotatedImage, 0, 0);

	// Get image data and apply brightness/contrast/dithering adjustments to the rotated image
	const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
	const processedData = ditherImageData(imgData, algorithm, threshold, brightness, contrast, noise);

	// Put the processed data back
	tempCtx.putImageData(processedData, 0, 0);

	return tempCanvas;
};

/**
 * Draws text vertically (one letter stacked on top of another, rotated -90 degrees)
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {object} options
 */
const drawVerticalText = (ctx, text, options) => {
	const { x, y, width, height, fontFamily, fontSize, fontWeight, align } = options;

	ctx.save();
	ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
	ctx.textBaseline = "middle";

	// Filter out whitespace characters for proper centering
	const visibleChars = text.split("").filter((char) => char.trim());

	// Calculate total text height needed for stacking
	const lineHeight = fontSize * 1.2; // Add some spacing between letters
	const totalTextHeight = visibleChars.length * lineHeight;

	// Calculate center point for rotation
	const centerX = x + width / 2;
	const centerY = y + height / 2;

	// Move to center and rotate -90 degrees
	ctx.translate(centerX, centerY);
	ctx.rotate(-Math.PI / 2);

	// In the rotated coordinate system:
	// - X axis now points up (was Y axis)
	// - Y axis now points left (was -X axis)
	// We want letters stacked vertically, so we need to vary the Y coordinate (which is now horizontal)

	// Calculate starting Y position (horizontal in rotated system) for centering
	let startY = -totalTextHeight / 2 + lineHeight / 2;
	let charX = 0;

	// Adjust X position based on alignment (vertical in rotated coordinate system)
	switch (align) {
		case "left":
			charX = -width / 2 + fontSize / 2;
			break;
		case "right":
			charX = width / 2 - fontSize / 2;
			break;
		case "center":
		default:
			charX = 0;
			break;
	}

	// Draw each visible character
	let charIndex = 0;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char.trim()) {
			// Only draw non-whitespace characters
			ctx.textAlign = "center";
			// In rotated system: X stays same, Y changes for stacking
			ctx.fillText(char, charX, startY + charIndex * lineHeight);
			charIndex++;
		}
	}

	ctx.restore();
};

const updateLabelSize = (canvas) => {
	const inputWidth = $("#inputWidth").valueAsNumber;
	const inputHeight = $("#inputHeight").valueAsNumber;
	if (isNaN(inputWidth) || isNaN(inputHeight)) {
		handleError("label size invalid");
		return;
	}

	labelSize.width = inputWidth;
	labelSize.height = inputHeight;

	// Reset canvas display size so container can expand before measuring
	canvas.style.width = ""; // remove inline width
	canvas.style.height = ""; // remove inline height

	// Calculate canvas dimensions for consistent preview sizing
	// Image sent to printer is printed top to bottom, so reverse width and height
	const actualCanvasWidth = labelSize.height * 8;
	const actualCanvasHeight = labelSize.width * 8;

	// Set canvas internal dimensions (for printing accuracy)
	canvas.width = actualCanvasWidth;
	canvas.height = actualCanvasHeight;

	// Calculate display size to maintain consistent preview height
	const previewContainer = canvas.parentElement;
	// Use the container's current rendered size instead of hard-coding 300px
	const containerHeight = previewContainer.clientHeight || 300;
	const containerWidth = previewContainer.clientWidth || 300;

	// Determine an integer scale factor (nearest-neighbour) so that each canvas pixel maps to an integer number of screen pixels.
	const scaleX = Math.floor(containerWidth / actualCanvasWidth);
	const scaleY = Math.floor(containerHeight / actualCanvasHeight);
	let scale = Math.max(1, Math.min(scaleX, scaleY));

	// Fallback to fractional scaling (with pixelated rendering) if the canvas is larger than the container in both directions.
	if (scaleX === 0 && scaleY === 0) {
		scale = Math.min(containerWidth / actualCanvasWidth, containerHeight / actualCanvasHeight);
	}

	const displayWidth = actualCanvasWidth * scale;
	const displayHeight = actualCanvasHeight * scale;

	// Apply display size via CSS
	canvas.style.width = displayWidth + "px";
	canvas.style.height = displayHeight + "px";
	// Ensure nearest-neighbour scaling is used when the browser rasterises the canvas element
	canvas.style.imageRendering = "pixelated";

	// Refresh preview based on active tab
	const activePane = document.querySelector(".tab-pane.show.active");
	if (activePane && activePane.id === "nav-barcode") {
		// Barcode tab is active – refresh barcode preview
		updateCanvasBarcode(canvas);
	} else {
		// Default to text preview (covers both Text & Image tab and cases where no explicit tab links exist)
		updateCanvasText(canvas);
	}
};

const updateCanvasText = async (canvas) => {
	const text = $("#inputText").value;
	const fontSize = $("#inputFontSize").valueAsNumber;
	const fontFamily = $("#fontFamily")?.value || "Arial, sans-serif";
	const fontWeight = $("#fontWeight")?.value || "normal";
	const textAlign = $("#textAlign")?.value || "center";
	const verticalText = $("#verticalText")?.checked || false;
	const imagePosition = $("#imagePosition")?.value || "none";
	const imageSize = $("#imageSize")?.valueAsNumber || 50;
	const imageRotation = parseInt($("#imageRotation")?.value || "0", 10);
	const algorithm = $("#ditherAlgorithm")?.value || "floyd";
	const threshold = $("#threshold")?.valueAsNumber ?? 128;
	const brightness = $("#brightness")?.valueAsNumber ?? 0;
	const contrast = $("#contrast")?.valueAsNumber ?? 0;
	const noise = $("#noise")?.valueAsNumber ?? 0;

	// QR Code and Barcode settings
	const codeType = $("#codeType")?.value || "none";
	const codeData = $("#codeData")?.value || "";
	const codePosition = $("#codePosition")?.value || "above";
	const codeSize = $("#codeSize")?.valueAsNumber || 30;
	const qrErrorCorrection = $("#qrErrorCorrection")?.value || "M";
	const barcodeFormat = $("#barcodeFormat")?.value || "CODE128";

	// Generate QR code or barcode if needed
	if (codeType !== "none" && codeData.trim()) {
		try {
			generatedCode = await generateCode(codeData, codeType, barcodeFormat, qrErrorCorrection);
		} catch (err) {
			console.error("Code generation failed:", err);
			generatedCode = null;
		}
	} else {
		generatedCode = null;
	}

	if (isNaN(fontSize)) {
		handleError("font size invalid");
		return;
	}

	const ctx = canvas.getContext("2d");
	// Disable smoothing so scaled content stays pixelated in the printed preview
	ctx.imageSmoothingEnabled = false;
	ctx.fillStyle = "#fff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.save();
	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.rotate(Math.PI / 2);

	// Apply print offset
	ctx.translate(offsetX, offsetY);

	const rotatedWidth = canvas.height;
	const rotatedHeight = canvas.width;

	// Handle image and code positioning
	let textArea = {
		x: -rotatedWidth / 2,
		y: -rotatedHeight / 2,
		width: rotatedWidth,
		height: rotatedHeight,
	};

	// Calculate space needed for codes and images
	let totalImageHeight = 0;
	let totalImageWidth = 0;
	let codeImageHeight = 0;
	let codeImageWidth = 0;

	// Calculate code dimensions if present
	if (generatedCode) {
		const codeSizeRatio = codeSize / 100;
		const maxCodeW = rotatedWidth * codeSizeRatio;
		const maxCodeH = rotatedHeight * codeSizeRatio;
		const codeScale = Math.min(maxCodeW / generatedCode.width, maxCodeH / generatedCode.height);
		codeImageWidth = generatedCode.width * codeScale;
		codeImageHeight = generatedCode.height * codeScale;
	}

	if (uploadedImage && imagePosition !== "none") {
		// Process the image with brightness, contrast, dithering adjustments, and rotation
		// NOTE: Only use the image rotation setting (from dropdown), not the preview rotation.
		// Preview rotation is purely visual (CSS transform) and doesn't affect canvas content or printed output.
		processedImage = processImageWithAdjustments(
			uploadedImage,
			brightness,
			contrast,
			algorithm,
			threshold,
			imageRotation,
			noise
		);

		const imageSizeRatio = imageSize / 100;

		if (imagePosition === "background") {
			// Draw image as background first
			const maxW = rotatedWidth;
			const maxH = rotatedHeight;
			const scale =
				Math.min(maxW / processedImage.width, maxH / processedImage.height) * imageSizeRatio;
			const drawW = processedImage.width * scale;
			const drawH = processedImage.height * scale;

			ctx.globalAlpha = 0.3; // Make background image semi-transparent
			ctx.drawImage(processedImage, -drawW / 2, -drawH / 2, drawW, drawH);
			ctx.globalAlpha = 1.0;
		} else {
			// Calculate image dimensions
			const maxImageW = rotatedWidth * imageSizeRatio;
			const maxImageH = rotatedHeight * imageSizeRatio;
			const scale = Math.min(maxImageW / processedImage.width, maxImageH / processedImage.height);
			const imageW = processedImage.width * scale;
			const imageH = processedImage.height * scale;

			let imageX, imageY;

			switch (imagePosition) {
				case "above":
					imageX = -imageW / 2;
					imageY = -rotatedHeight / 2;
					textArea.y = imageY + imageH + 10;
					textArea.height = rotatedHeight - imageH - 10;
					break;
				case "below":
					imageX = -imageW / 2;
					imageY = rotatedHeight / 2 - imageH;
					textArea.height = rotatedHeight - imageH - 10;
					break;
				case "left":
					imageX = -rotatedWidth / 2;
					imageY = -imageH / 2;
					textArea.x = imageX + imageW + 10;
					textArea.width = rotatedWidth - imageW - 10;
					break;
				case "right":
					imageX = rotatedWidth / 2 - imageW;
					imageY = -imageH / 2;
					textArea.width = rotatedWidth - imageW - 10;
					break;
			}

			// Draw the processed image
			ctx.drawImage(processedImage, imageX, imageY, imageW, imageH);
		}
	}

	// Draw QR code or barcode
	if (generatedCode && codePosition !== "background") {
		let codeX, codeY;

		switch (codePosition) {
			case "above":
				codeX = -codeImageWidth / 2;
				codeY = textArea.y;
				textArea.y = codeY + codeImageHeight + 10;
				textArea.height = Math.max(0, textArea.height - codeImageHeight - 10);
				break;
			case "below":
				codeX = -codeImageWidth / 2;
				codeY = textArea.y + textArea.height - codeImageHeight;
				textArea.height = Math.max(0, textArea.height - codeImageHeight - 10);
				break;
			case "left":
				codeX = textArea.x;
				codeY = -codeImageHeight / 2;
				textArea.x = codeX + codeImageWidth + 10;
				textArea.width = Math.max(0, textArea.width - codeImageWidth - 10);
				break;
			case "right":
				codeX = textArea.x + textArea.width - codeImageWidth;
				codeY = -codeImageHeight / 2;
				textArea.width = Math.max(0, textArea.width - codeImageWidth - 10);
				break;
		}

		// Draw the generated code
		ctx.drawImage(generatedCode, codeX, codeY, codeImageWidth, codeImageHeight);
	} else if (generatedCode && codePosition === "background") {
		// Draw code as background
		ctx.globalAlpha = 0.2; // Make background code semi-transparent
		ctx.drawImage(
			generatedCode,
			-codeImageWidth / 2,
			-codeImageHeight / 2,
			codeImageWidth,
			codeImageHeight
		);
		ctx.globalAlpha = 1.0;
	}

	// Draw text
	if (text.trim()) {
		ctx.fillStyle = "#000";
		const font = `${fontWeight} ${fontSize}px ${fontFamily}`;

		if (verticalText) {
			drawVerticalText(ctx, text, {
				x: textArea.x,
				y: textArea.y,
				width: textArea.width,
				height: textArea.height,
				fontFamily,
				fontSize,
				fontWeight,
				align: textAlign,
			});
		} else {
			drawText(ctx, text, {
				x: textArea.x,
				y: textArea.y,
				width: textArea.width,
				height: textArea.height,
				font: fontFamily,
				fontSize,
				fontWeight,
				align: textAlign,
				vAlign: "middle",
			});
		}
	}

	ctx.restore();
};

const updateCanvasBarcode = (canvas) => {
	const barcodeData = $("#inputBarcode").value;
	const image = document.createElement("img");
	image.addEventListener("load", () => {
		const ctx = canvas.getContext("2d");
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		ctx.translate(canvas.width / 2, canvas.height / 2);
		ctx.rotate(Math.PI / 2);

		// Apply print offset
		ctx.translate(offsetX, offsetY);

		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(image, -image.width / 2, -image.height / 2);

		ctx.rotate(-Math.PI / 2);
		ctx.translate(-canvas.width / 2, -canvas.height / 2);
	});

	JsBarcode(image, barcodeData, {
		format: "CODE128",
		width: 2,
		height: labelSize.height * 7,
		displayValue: false,
	});
};

const handleError = (err) => {
	console.error(err);

	const toast = bootstrap.Toast.getOrCreateInstance($("#errorToast"));
	$("#errorText").textContent = err.toString();
	toast.show();
};

// Insert the updateImagePreview helper before DOMContentLoaded
const updateImagePreview = () => {
	const previewGroup = $("#imagePreviewGroup");
	const originalCanvas = $("#imagePreviewOriginal");
	const processedCanvasEl = $("#imagePreviewProcessed");

	if (!previewGroup || !originalCanvas || !processedCanvasEl) return;

	if (!uploadedImage) {
		previewGroup.style.display = "none";
		return;
	}

	previewGroup.style.display = "block";

	const brightness = $("#brightness")?.valueAsNumber ?? 0;
	const contrast = $("#contrast")?.valueAsNumber ?? 0;
	const algorithm = $("#ditherAlgorithm")?.value || "floyd";
	const threshold = $("#threshold")?.valueAsNumber ?? 128;
	const imageRotation = parseInt($("#imageRotation")?.value || "0", 10);
	const noise = $("#noise")?.valueAsNumber ?? 0;

	const maxPreviewDim = 120; // px ─ keep previews compact

	// ---------------------------------------------
	// Original (un-rotated) preview
	// ---------------------------------------------
	const origScale = Math.min(
		1,
		maxPreviewDim / Math.max(uploadedImage.width, uploadedImage.height)
	);
	const origW = Math.round(uploadedImage.width * origScale);
	const origH = Math.round(uploadedImage.height * origScale);

	originalCanvas.width = origW;
	originalCanvas.height = origH;
	originalCanvas.style.width = origW + "px";
	originalCanvas.style.height = origH + "px";
	// Ensure the browser preserves hard edges when scaling
	originalCanvas.style.imageRendering = "pixelated";

	const origCtx = originalCanvas.getContext("2d");
	origCtx.imageSmoothingEnabled = false;
	origCtx.clearRect(0, 0, origW, origH);
	origCtx.drawImage(uploadedImage, 0, 0, origW, origH);

	// ---------------------------------------------
	// Processed (may be rotated) preview
	// ---------------------------------------------
	const processedTemp = processImageWithAdjustments(
		uploadedImage,
		brightness,
		contrast,
		algorithm,
		threshold,
		imageRotation,
		noise
	);

	const procScale = Math.min(
		1,
		maxPreviewDim / Math.max(processedTemp.width, processedTemp.height)
	);
	const procW = Math.round(processedTemp.width * procScale);
	const procH = Math.round(processedTemp.height * procScale);

	processedCanvasEl.width = procW;
	processedCanvasEl.height = procH;
	processedCanvasEl.style.width = procW + "px";
	processedCanvasEl.style.height = procH + "px";
	processedCanvasEl.style.imageRendering = "pixelated";

	const procCtx = processedCanvasEl.getContext("2d");
	procCtx.imageSmoothingEnabled = false;
	procCtx.clearRect(0, 0, procW, procH);
	procCtx.drawImage(processedTemp, 0, 0, procW, procH);

	// ---------------------------------------------
	// Ensure the surrounding flex items shrink/expand correctly
	// ---------------------------------------------
	// We explicitly set the min-height of each flex-fill wrapper so that
	// vertical images get enough room, preventing cropping.
	[originalCanvas, processedCanvasEl].forEach((c) => {
		const wrapper = c.closest(".flex-fill");
		if (wrapper) {
			wrapper.style.minWidth = maxPreviewDim + "px";
			wrapper.style.minHeight = Math.max(origH, procH) + "px";
		}
	});
};

document.addEventListener("DOMContentLoaded", function () {
	const canvas = document.querySelector("#canvas");

	document.addEventListener("shown.bs.tab", (e) => {
		if (e.target.id === "nav-text-tab") updateCanvasText(canvas);
		else if (e.target.id === "nav-barcode-tab") updateCanvasBarcode(canvas);
	});

	$all("#inputWidth, #inputHeight").forEach((e) =>
		e.addEventListener("input", () => updateLabelSize(canvas))
	);
	updateLabelSize(canvas);

	// Handle window resize to maintain proper canvas display sizing
	window.addEventListener("resize", () => {
		// Debounce resize events
		clearTimeout(window.resizeTimeout);
		window.resizeTimeout = setTimeout(() => {
			updateLabelSize(canvas);
		}, 100);
	});

	// Text and image controls
	$all(
		"#inputText, #inputFontSize, #fontFamily, #fontWeight, #textAlign, #verticalText, #imagePosition, #imageSize, #imageRotation, #ditherAlgorithm, #threshold, #brightness, #contrast, #noise"
	).forEach((e) => e.addEventListener("input", () => updateCanvasText(canvas)));

	// QR Code and Barcode controls
	$all(
		"#codeType, #codeData, #codePosition, #codeSize, #qrErrorCorrection, #barcodeFormat"
	).forEach((e) => e.addEventListener("input", () => updateCanvasText(canvas)));

	// Handle checkbox change event for vertical text
	$("#verticalText").addEventListener("change", () => updateCanvasText(canvas));

	// Handle code type change to show/hide relevant options
	$("#codeType").addEventListener("change", (e) => {
		const codeType = e.target.value;
		const qrGroup = $("#qrErrorCorrectionGroup");
		const barcodeGroup = $("#barcodeFormatGroup");
		const codeDataGroup = $("#codeDataGroup");
		const codePositionGroup = $("#codePositionGroup");
		const codeSizeGroup = $("#codeSizeGroup");

		if (codeType === "none") {
			qrGroup.style.display = "none";
			barcodeGroup.style.display = "none";
			codeDataGroup.style.display = "none";
			codePositionGroup.style.display = "none";
			codeSizeGroup.style.display = "none";
		} else {
			codeDataGroup.style.display = "block";
			codePositionGroup.style.display = "block";
			codeSizeGroup.style.display = "block";

			if (codeType === "qr") {
				qrGroup.style.display = "block";
				barcodeGroup.style.display = "none";
			} else if (codeType === "barcode") {
				qrGroup.style.display = "none";
				barcodeGroup.style.display = "block";
			}
		}

		updateCanvasText(canvas);
	});

	// Image upload
	const inputImage = $("#inputImage");
	if (inputImage) {
		inputImage.addEventListener("change", (e) => {
			const file = e.target.files[0];
			if (!file) {
				uploadedImage = null;
				updateCanvasText(canvas);
				updateImagePreview();
				return;
			}
			const img = new Image();
			img.onload = () => {
				uploadedImage = img;
				updateCanvasText(canvas);
				updateImagePreview();
			};
			img.src = URL.createObjectURL(file);
		});
	}

	// Update slider value displays
	const imageSizeSlider = $("#imageSize");
	const thresholdSlider = $("#threshold");
	const brightnessSlider = $("#brightness");
	const contrastSlider = $("#contrast");
	const noiseSlider = $("#noise");
	const codeSizeSlider = $("#codeSize");

	if (imageSizeSlider) {
		imageSizeSlider.addEventListener("input", (e) => {
			$("#imageSizeValue").textContent = e.target.value;
		});
	}

	if (thresholdSlider) {
		thresholdSlider.addEventListener("input", (e) => {
			$("#thresholdValue").textContent = e.target.value;
		});
	}

	if (brightnessSlider) {
		brightnessSlider.addEventListener("input", (e) => {
			$("#brightnessValue").textContent = e.target.value;
		});
	}

	if (contrastSlider) {
		contrastSlider.addEventListener("input", (e) => {
			$("#contrastValue").textContent = e.target.value;
		});
	}

	if (noiseSlider) {
		noiseSlider.addEventListener("input", (e) => {
			$("#noiseValue").textContent = e.target.value;
		});
	}

	if (codeSizeSlider) {
		codeSizeSlider.addEventListener("input", (e) => {
			$("#codeSizeValue").textContent = e.target.value;
		});
	}

	// Initialize QR/barcode options visibility
	const initialCodeType = $("#codeType").value;
	if (initialCodeType === "none") {
		$("#qrErrorCorrectionGroup").style.display = "none";
		$("#barcodeFormatGroup").style.display = "none";
		$("#codeDataGroup").style.display = "none";
		$("#codePositionGroup").style.display = "none";
		$("#codeSizeGroup").style.display = "none";
	}

	updateCanvasText(canvas);

	// Initialize preview rotation to default state
	updateRotationButtons();

	$("#inputBarcode").addEventListener("input", () => updateCanvasBarcode(canvas));

	// Preview rotation controls - these only affect the visual CSS rotation, not the canvas content
	$("#rotateClockwise").addEventListener("click", () => {
		previewRotation = (previewRotation + 90) % 360;
		updateRotationButtons();
	});

	$("#rotateCounterClockwise").addEventListener("click", () => {
		// Use negative rotation for true counter-clockwise movement
		previewRotation = previewRotation - 90;
		// Normalize to keep within reasonable bounds but preserve negative values
		if (previewRotation <= -360) {
			previewRotation += 360;
		}
		updateRotationButtons();
	});

	// Print offset controls
	const updateOffsetDisplay = () => {
		$("#offsetXValue").textContent = offsetX;
		$("#offsetYValue").textContent = offsetY;
	};

	$("#offsetUp").addEventListener("click", () => {
		const step = parseInt($("#offsetStep").value);
		offsetY -= step;
		updateOffsetDisplay();
		updateCanvasText(canvas);
	});

	$("#offsetDown").addEventListener("click", () => {
		const step = parseInt($("#offsetStep").value);
		offsetY += step;
		updateOffsetDisplay();
		updateCanvasText(canvas);
	});

	$("#offsetLeft").addEventListener("click", () => {
		const step = parseInt($("#offsetStep").value);
		offsetX -= step;
		updateOffsetDisplay();
		updateCanvasText(canvas);
	});

	$("#offsetRight").addEventListener("click", () => {
		const step = parseInt($("#offsetStep").value);
		offsetX += step;
		updateOffsetDisplay();
		updateCanvasText(canvas);
	});

	$("#offsetReset").addEventListener("click", () => {
		offsetX = 0;
		offsetY = 0;
		updateOffsetDisplay();
		updateCanvasText(canvas);
	});

	// Initialize offset display
	updateOffsetDisplay();

	$("form").addEventListener("submit", (e) => {
		e.preventDefault();
		navigator.bluetooth
			.requestDevice({
				acceptAllDevices: true,
				optionalServices: ["0000ff00-0000-1000-8000-00805f9b34fb"],
			})
			.then((device) => device.gatt.connect())
			.then((server) => server.getPrimaryService("0000ff00-0000-1000-8000-00805f9b34fb"))
			.then((service) => service.getCharacteristic("0000ff02-0000-1000-8000-00805f9b34fb"))
			.then((char) => printCanvas(char, canvas))
			.catch(handleError);
	});

	// Inside DOMContentLoaded block, after existing listeners, add preview update hooks
	$all("#ditherAlgorithm, #threshold, #brightness, #contrast, #noise, #imageRotation").forEach(
		(e) => e.addEventListener("input", updateImagePreview)
	);

	// Call once on load
	updateImagePreview();
});
