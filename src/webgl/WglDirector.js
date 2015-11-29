import Rect from "src/math/Rect.js"
import WglCache from "src/webgl/WglCache.js"
import WglShader from "src/webgl/WglShader.js"
import WglTexture from "src/webgl/WglTexture.js"

class WglDirectorSharedContext {
    constructor() {
        /** @type {!HTMLCanvasElement} */
        this.canvas = document.createElement('canvas');

        //noinspection JSValidateTypes
        /** @type {!WebGLRenderingContext} */
        let g = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        //noinspection JSValidateTypes
        if (g === null) {
            document.removeChild(this.canvas);
            throw new Error('Error creating WebGL context.');
        }
        if (g.getExtension('OES_texture_float') === undefined) {
            document.removeChild(this.canvas);
            throw new Error("WebGL support for 32-bit floats not present.")
        }

        /** @type {!WglCache} */
        this.cache = new WglCache(g, nextUniqueId++, 0);

        this.canvas.addEventListener(
            "webglcontextrestored",
                event => {
                event.preventDefault();
                this.cache.temporaryIdentifier++;
            },
            false);

        this.canvas.addEventListener(
            'webglcontextlost',
                event => {
                event.preventDefault();
                this.cache.temporaryIdentifier++;
            },
            false);
    };
}

let nextUniqueId = 0;
let shared = undefined;

/**
 * A context for telling webgl to do useful things with shaders and textures, like rendering.
 */
export default class WglDirector {
    constructor() {
        if (shared === undefined) {
            // Tests fail if too many directors are created, and it's wasteful to make so many canvases when only one
            // is required. Not aware of any downsides, other than differing side effects (i.e. number of canvases added
            // to the DOM).
            shared = new WglDirectorSharedContext();
        }

        /**
         * @type {!HTMLCanvasElement}
         * @private
         */
        this.canvas = shared.canvas;

        /**
         * @type {!WebGLRenderingContext}
         * @private
         */
        this.g = shared.g;

        /**
         * @type {!WglCache}
         */
        this.cache = shared.cache;
    };

    /**
     * Creates an image texture with the given size and pixel data, passes it into the given function, then deletes it.
     * @param {!function(!WebGLTexture)} func
     * @param {!int} width
     * @param {!int} height
     * @param {!Float32Array} pixelColorData
     */
    useRawDataTextureIn(width, height, pixelColorData, func) {
        let s = WebGLRenderingContext;
        let g = this.cache.webGLRenderingContext;
        let t = g.createTexture();
        try {
            g.bindTexture(WebGLRenderingContext.TEXTURE_2D, t);
            g.texParameteri(s.TEXTURE_2D, s.TEXTURE_MAG_FILTER, s.NEAREST);
            g.texParameteri(s.TEXTURE_2D, s.TEXTURE_MIN_FILTER, s.NEAREST);
            g.texImage2D(s.TEXTURE_2D, 0, s.RGBA, width, height, 0, s.RGBA, s.FLOAT, pixelColorData);
            func(t);
        } finally {
            g.deleteTexture(t);
        }
    }

    /**
     * Overwrites the given texture with the output of the given shader when given the given uniform arguments.
     * @param {!WglTexture} texture
     * @param {!WglShader} shader
     * @param {!(!WglArg[])} uniformArguments
     */
    render(texture, shader, uniformArguments) {
        let c = this.cache;
        c.ensureAttributesAreBound();
        texture.bindFramebufferFor(c);
        shader.bindInstanceFor(c, uniformArguments);

        let s = WebGLRenderingContext;
        c.webGLRenderingContext.drawElements(s.TRIANGLES, 6, s.UNSIGNED_SHORT, 0);
    };

    /**
     * Checks if the underlying webgl context has flagged an error, throwing an Error describing the issue if so.
     * @param {!string} previousOperationDescription
     */
    checkForError(previousOperationDescription) {
        var e = this.cache.webGLRenderingContext.getError();
        var s = WebGLRenderingContext;
        if (e === s.NO_ERROR) {
            return;
        }
        var m = {
            [s.CONTEXT_LOST_WEBGL]: "CONTEXT_LOST_WEBGL",
            [s.CONTEXT_LOST_WEBGL]: "CONTEXT_LOST_WEBGL",
            [s.OUT_OF_MEMORY]: "OUT_OF_MEMORY",
            [s.INVALID_ENUM]: "INVALID_ENUM",
            [s.INVALID_VALUE]: "INVALID_VALUE",
            [s.INVALID_OPERATION]: "INVALID_OPERATION",
            [s.INVALID_FRAMEBUFFER_OPERATION]: "INVALID_FRAMEBUFFER_OPERATION"
        };
        var d = m[e] !== undefined ? m[e] : "?";
        throw new Error(`gl.getError() returned ${e} (${d}) after ${previousOperationDescription}.`);
    };

    /**
     * @param {!WglTexture} texture
     * @param {!Rect=} rect
     * @param {!Uint8Array=} destinationBuffer
     * @returns {!Uint8Array}
     */
    readPixelColorBytes(texture, rect = undefined, destinationBuffer = undefined) {
        rect = rect || new Rect(0, 0, texture.width, texture.height);
        destinationBuffer = destinationBuffer || new Uint8Array(rect.w * rect.h * 4);

        let s = WebGLRenderingContext;
        let c = this.cache;
        let g = c.webGLRenderingContext;
        texture.bindFramebufferFor(c);
        g.readPixels(rect.x, rect.y, rect.w, rect.h, s.RGBA, s.UNSIGNED_BYTE, destinationBuffer);
        this.checkForError("readPixels(..., RGBA, UNSIGNED_BYTE, ...)");

        return destinationBuffer;
    };

    /**
     * @param {!WglTexture} texture
     * @param {!Rect=} rect
     * @param {!Float32Array=} destinationBuffer
     * @returns {!Float32Array}
     */
    readPixelColorFloats(texture, rect = undefined, destinationBuffer = undefined) {
        rect = rect || new Rect(0, 0, texture.width, texture.height);
        destinationBuffer = destinationBuffer || new Float32Array(rect.w * rect.h * 4);

        let s = WebGLRenderingContext;
        let c = this.cache;
        let g = c.webGLRenderingContext;
        texture.bindFramebufferFor(c);
        g.readPixels(rect.x, rect.y, rect.w, rect.h, s.RGBA, s.FLOAT, destinationBuffer);
        this.checkForError("readPixels(..., RGBA, FLOAT, ...)");

        return destinationBuffer;
    };
}