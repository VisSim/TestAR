import {
    BoxGeometry,
    BufferGeometry,
    CylinderGeometry,
    DoubleSide,
    Euler,
    Float32BufferAttribute,
    Line,
    LineBasicMaterial,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    OctahedronGeometry,
    PlaneGeometry,
    Quaternion,
    Raycaster,
    SphereGeometry,
    TorusGeometry,
    Vector3
} from '../v3d.module.js';

const _raycaster = new Raycaster();
_raycaster.params.checkVisibility = false;

const _tempVector = new Vector3();
const _tempVector2 = new Vector3();
const _tempQuaternion = new Quaternion();
const _unit = {
    X: new Vector3(1, 0, 0),
    Y: new Vector3(0, 1, 0),
    Z: new Vector3(0, 0, 1)
};

const _changeEvent = { type: 'change' };
const _mouseDownEvent = { type: 'mouseDown' };
const _mouseUpEvent = { type: 'mouseUp', mode: null };
const _objectChangeEvent = { type: 'objectChange' };

const INPUT = {

    NONE: Symbol(),
    ONE_FINGER: Symbol(),
    ONE_FINGER_SWITCHED: Symbol(),
    TWO_FINGER: Symbol(),
    MULT_FINGER: Symbol(),
    CURSOR: Symbol()

};

let touchStartDistance = 0;

class TransformControls extends Object3D {

    constructor(camera, domElement) {

        super();

        if (domElement === undefined) {

            console.warn('v3d.TransformControls: The second parameter "domElement" is now mandatory.');
            domElement = document;

        }

        this.isTransformControls = true;

        this.visible = false;
        this.domElement = domElement;
        this.domElement.style.touchAction = 'none'; // disable touch scroll

        // Input & touch interaction
        this._input = INPUT.NONE;
        this._touchStart = [];
        this._touchCurrent = [];

        // Two fingers touch interaction
        this._switchSensibility = 32;   // Minimum movement to be performed to fire single pan start after the second finger has been released
        this._startFingerDistance = 0;  // Distance between two fingers
        this._currentFingerDistance = 0;
        this._currentScale = 1;

        //$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
        //const _gizmo = new TransformControlsGizmo();
        //this._gizmo = _gizmo;
        //this.add(_gizmo);

        const _plane = new TransformControlsPlane();
        this._plane = _plane;
        this.add(_plane);

        const scope = this;

        // Defined getter, setter and store for a property
        function defineProperty(propName, defaultValue) {

            let propValue = defaultValue;

            Object.defineProperty(scope, propName, {

                get: function() {

                    return propValue !== undefined ? propValue : defaultValue;

                },

                set: function(value) {

                    if (propValue !== value) {

                        propValue = value;
                        _plane[propName] = value;
                        //_gizmo[propName] = value;

                        scope.dispatchEvent({ type: propName + '-changed', value: value });
                        scope.dispatchEvent(_changeEvent);

                    }

                }

            });

            scope[propName] = defaultValue;
            _plane[propName] = defaultValue;
            //_gizmo[propName] = defaultValue;

        }

        // Define properties with getters/setter
        // Setting the defined property will automatically trigger change event
        // Defined properties are passed down to gizmo and plane

        defineProperty('camera', camera);
        defineProperty('object', undefined);
        defineProperty('enabled', true);
        defineProperty('axis', null);
        defineProperty('mode', 'rotate');
        defineProperty('translationSnap', null);
        defineProperty('rotationSnap', null);
        defineProperty('scaleSnap', null);
        defineProperty('space', 'world');
        defineProperty('size', 1);
        defineProperty('dragging', false);
        defineProperty('showX', true);
        defineProperty('showY', true);
        defineProperty('showZ', true);

        // Reusable utility variables

        const worldPosition = new Vector3();
        const worldPositionStart = new Vector3();
        const worldQuaternion = new Quaternion();
        const worldQuaternionStart = new Quaternion();
        const cameraPosition = new Vector3();
        const cameraQuaternion = new Quaternion();
        const pointStart = new Vector3();
        const pointEnd = new Vector3();
        const rotationAxis = new Vector3();
        const rotationAngle = 0;
        const eye = new Vector3();

        // TODO: remove properties unused in plane and gizmo

        defineProperty('worldPosition', worldPosition);
        defineProperty('worldPositionStart', worldPositionStart);
        defineProperty('worldQuaternion', worldQuaternion);
        defineProperty('worldQuaternionStart', worldQuaternionStart);
        defineProperty('cameraPosition', cameraPosition);
        defineProperty('cameraQuaternion', cameraQuaternion);
        defineProperty('pointStart', pointStart);
        defineProperty('pointEnd', pointEnd);
        defineProperty('rotationAxis', rotationAxis);
        defineProperty('rotationAngle', rotationAngle);
        defineProperty('eye', eye);

        this._offset = new Vector3();
        this._startNorm = new Vector3();
        this._endNorm = new Vector3();
        this._cameraScale = new Vector3();

        this._parentPosition = new Vector3();
        this._parentQuaternion = new Quaternion();
        this._parentQuaternionInv = new Quaternion();
        this._parentScale = new Vector3();

        this._worldScaleStart = new Vector3();
        this._worldQuaternionInv = new Quaternion();
        this._worldScale = new Vector3();

        this._positionStart = new Vector3();
        this._quaternionStart = new Quaternion();
        this._scaleStart = new Vector3();

        this._quaternionDefault = new Quaternion();
        this._scaleDefault = new Vector3();

        this._getPointer = getPointer.bind(this);
        this._onPointerDown = onPointerDown.bind(this);
        this._onPointerHover = onPointerHover.bind(this);
        this._onPointerMove = onPointerMove.bind(this);
        this._onPointerUp = onPointerUp.bind(this);

        this.domElement.addEventListener('pointerdown', this._onPointerDown);
        this.domElement.addEventListener('pointermove', this._onPointerHover);
        this.domElement.addEventListener('pointerup', this._onPointerUp);

    }

    // updateMatrixWorld  updates key transformation variables
    updateMatrixWorld() {

        if (this.object !== undefined) {

            this.object.updateMatrixWorld();

            if (this.object.parent === null) {

                console.error('TransformControls: The attached 3D object must be a part of the scene graph.');

            } else {

                this.object.parent.matrixWorld.decompose(this._parentPosition, this._parentQuaternion, this._parentScale);

            }

            this.object.matrixWorld.decompose(this.worldPosition, this.worldQuaternion, this._worldScale);

            this._parentQuaternionInv.copy(this._parentQuaternion).invert();
            this._worldQuaternionInv.copy(this.worldQuaternion).invert();

        }

        this.camera.updateMatrixWorld();
        this.camera.matrixWorld.decompose(this.cameraPosition, this.cameraQuaternion, this._cameraScale);

        if (this.camera.isOrthographicCamera) {

            this.camera.getWorldDirection(this.eye).negate();

        } else {

            this.eye.copy(this.cameraPosition).sub(this.worldPosition).normalize();

        }

        super.updateMatrixWorld(this);

    }

    pointerHover(pointer) {

        if (this.object === undefined || this.dragging === true) return;

        // Disabled Gizmo hover / picker
       /* _raycaster.setFromCamera(pointer, this.camera);

        const intersect = intersectObjectWithRay(this._gizmo.picker[this.mode], _raycaster);

        if (intersect) {

            this.axis = intersect.object.name;

        } else {

            this.axis = null;

        }*/

    }

    //pointerDown(pointer) {
    pointerDown(event) {

        let pointer = this._getPointer(event)

        //if (this.object === undefined || this.dragging === true || pointer.button !== 0) return;
        //if (this.dragging === true || pointer.button !== 0) return;
        
        this.axis = 'XYZE';
        //this.mode = 'rotate';       

        if (event.pointerType == 'touch' && this._input != INPUT.CURSOR) {

            this._touchStart.push(event);
            this._touchCurrent.push(event);

            switch (this._input) {
                case INPUT.NONE:
                    // Single touch Start
                    this.mode = 'rotate';
                    this._input = INPUT.ONE_FINGER;
                    break;

                case INPUT.ONE_FINGER:
                case INPUT.ONE_FINGER_SWITCHED:
                    this.mode = 'scale';
                    this._input = INPUT.TWO_FINGER;

                    this.onPinchStart();
                    break;

                case INPUT.TWO_FINGER:
                    this.mode = 'scale';
                    this._input = INPUT.MULT_FINGER;
                    break;

            }

        } else if (event.pointerType != 'touch' && this._input == INPUT.NONE) {
            this._input = INPUT.CURSOR;
        }

        if (this.axis !== null) {

            _raycaster.setFromCamera(pointer, this.camera);
            const planeIntersect = intersectObjectWithRay(this._plane, _raycaster, true);
            
            if (planeIntersect) {
                
                this.object.updateMatrixWorld();
                this.object.parent.updateMatrixWorld();

                this._positionStart.copy(this.object.position);
                this._quaternionStart.copy(this.object.quaternion);
                this._scaleStart.copy(this.object.scale);

                this.object.matrixWorld.decompose(this.worldPositionStart, this.worldQuaternionStart, this._worldScaleStart);

                this.pointStart.copy(planeIntersect.point).sub(this.worldPositionStart);

            }

            this.dragging = true;
            _mouseDownEvent.mode = this.mode;
            this.dispatchEvent(_mouseDownEvent);

        }

    }

    pointerMove(event) {

        let pointer = this._getPointer(event);

        const axis = this.axis;
        const mode = this.mode;
        const object = this.object;
        let space = this.space;

        if (event.pointerType == 'touch' && this._input != INPUT.CURSOR) {
            this.updateTouchEvent(event);
        }

        if (mode === 'scale') {
            space = 'local';

        } else if (axis === 'E' || axis === 'XYZE' || axis === 'XYZ') {
            space = 'world';

        }

        if (object === undefined || axis === null || this.dragging === false || pointer.button !== -1) return;

        //console.log("Mode : ", mode);
        _raycaster.setFromCamera(pointer, this.camera);

        const planeIntersect = intersectObjectWithRay(this._plane, _raycaster, true);
        if (!planeIntersect) return;

        this.pointEnd.copy(planeIntersect.point).sub(this.worldPositionStart);

        if (mode === 'translate') {
            // Apply translate
            this._offset.copy(this.pointEnd).sub(this.pointStart);

            if (space === 'local' && axis !== 'XYZ') {
                this._offset.applyQuaternion(this._worldQuaternionInv);

            }

            if (axis.indexOf('X') === -1) this._offset.x = 0;
            if (axis.indexOf('Y') === -1) this._offset.y = 0;
            if (axis.indexOf('Z') === -1) this._offset.z = 0;

            if (space === 'local' && axis !== 'XYZ') {
                this._offset.applyQuaternion(this._quaternionStart).divide(this._parentScale);

            } else {
                this._offset.applyQuaternion(this._parentQuaternionInv).divide(this._parentScale);

            }

            object.position.copy(this._offset).add(this._positionStart);

            // Apply translation snap
            if (this.translationSnap) {
                if (space === 'local') {

                    object.position.applyQuaternion(_tempQuaternion.copy(this._quaternionStart).invert());

                    if (axis.search('X') !== -1) {
                        object.position.x = Math.round(object.position.x / this.translationSnap) * this.translationSnap;
                    }

                    if (axis.search('Y') !== -1) {
                        object.position.y = Math.round(object.position.y / this.translationSnap) * this.translationSnap;
                    }

                    if (axis.search('Z') !== -1) {
                        object.position.z = Math.round(object.position.z / this.translationSnap) * this.translationSnap;
                    }

                    object.position.applyQuaternion(this._quaternionStart);

                }

                if (space === 'world') {

                    if (object.parent) {
                        object.position.add(_tempVector.setFromMatrixPosition(object.parent.matrixWorld));
                    }

                    if (axis.search('X') !== -1) {
                        object.position.x = Math.round(object.position.x / this.translationSnap) * this.translationSnap;
                    }

                    if (axis.search('Y') !== -1) {
                        object.position.y = Math.round(object.position.y / this.translationSnap) * this.translationSnap;
                    }

                    if (axis.search('Z') !== -1) {
                        object.position.z = Math.round(object.position.z / this.translationSnap) * this.translationSnap;
                    }

                    if (object.parent) {
                        object.position.sub(_tempVector.setFromMatrixPosition(object.parent.matrixWorld));

                    }

                }

            }

        } else if (mode === 'scale') {

            this._currentFingerDistance = this.calculatePointersDistance(this._touchCurrent[0], this._touchCurrent[1]);
            //this._currentFingerDistance = this._startFingerDistance;

            let scale = this._currentScale * this._currentFingerDistance / this._startFingerDistance;
            object.scale.set(scale, scale, scale);

            // Apply scale
            //object.scale.copy(this._scaleStart).multiply(_tempVector2);

            

        } else if (mode === 'rotate') {
            
            this._offset.copy(this.pointEnd).sub(this.pointStart);

            const ROTATION_SPEED = 5 / this.worldPosition.distanceTo(_tempVector.setFromMatrixPosition(this.camera.matrixWorld));

            if (axis === 'E') {

                this.rotationAxis.copy(this.eye);
                this.rotationAngle = this.pointEnd.angleTo(this.pointStart);

                this._startNorm.copy(this.pointStart).normalize();
                this._endNorm.copy(this.pointEnd).normalize();

                this.rotationAngle *= (this._endNorm.cross(this._startNorm).dot(this.eye) < 0 ? 1 : -1);

            } else if (axis === 'XYZE') {

                this.rotationAxis.copy(this._offset).cross(this.eye).normalize();
                this.rotationAngle = this._offset.dot(_tempVector.copy(this.rotationAxis).cross(this.eye)) * ROTATION_SPEED * 0.6;

            } else if (axis === 'X' || axis === 'Y' || axis === 'Z') {

                this.rotationAxis.copy(_unit[axis]);

                _tempVector.copy(_unit[axis]);

                if (space === 'local') {

                    _tempVector.applyQuaternion(this.worldQuaternion);

                }

                this.rotationAngle = this._offset.dot(_tempVector.cross(this.eye).normalize()) * ROTATION_SPEED;

            }

            // Apply rotation snap
            if (this.rotationSnap) this.rotationAngle = Math.round(this.rotationAngle / this.rotationSnap) * this.rotationSnap;

            // Apply rotate
            if (space === 'local' && axis !== 'E' && axis !== 'XYZE') {

                object.quaternion.copy(this._quaternionStart);
                object.quaternion.multiply(_tempQuaternion.setFromAxisAngle(this.rotationAxis, this.rotationAngle)).normalize();

            } else {

                this.rotationAxis.applyQuaternion(this._parentQuaternionInv);
                object.quaternion.copy(_tempQuaternion.setFromAxisAngle(this.rotationAxis, this.rotationAngle));
                object.quaternion.multiply(this._quaternionStart).normalize();

            }

        }

        this.dispatchEvent(_changeEvent);
        this.dispatchEvent(_objectChangeEvent);

    }

    pointerUp(event) {

        let pointer = this._getPointer(event);

        if (event.pointerType == 'touch' && this._input != INPUT.CURSOR) {

            const nTouch = this._touchCurrent.length;

            for (let i = 0; i < nTouch; i++) {
                if (this._touchCurrent[i].pointerId == event.pointerId) {

                    this._touchCurrent.splice(i, 1);
                    this._touchStart.splice(i, 1);
                    break;
                }
            }

            switch (this._input) {

                case INPUT.ONE_FINGER:
                case INPUT.ONE_FINGER_SWITCHED:                 
                    this._input = INPUT.NONE;
                    // this.onSinglePanEnd();
                    break;

                case INPUT.TWO_FINGER:
                    // Switching to singleStart
                    this._input = INPUT.ONE_FINGER_SWITCHED;
                    break;

                case INPUT.MULT_FINGER:
                    if (this._touchCurrent.length == 0) {
                        // Multi Cancel
                        this._input = INPUT.NONE;         
                    }
                    break;

            }

        }

        if (event.pointerType === 'touch' && event.isPrimary) {
            // Reset touchStartDistance on touch end
            touchStartDistance = 0;
            this._startFingerDistance = 0;
       }

       if (pointer.button !== 0) return;

        if (this.dragging && (this.axis !== null)) {

            _mouseUpEvent.mode = this.mode;
            this.dispatchEvent(_mouseUpEvent);

        }

        this.dragging = false;
        this.axis = null;

    }

    onPinchStart = () => {     
        this._startFingerDistance = this.calculatePointersDistance(this._touchCurrent[0], this._touchCurrent[1]);
        this._currentFingerDistance = this._startFingerDistance;
        this._currentScale = this.object.scale.x;

    };

    /**
     * Calculate the distance between two pointers
     * @param {PointerEvent} p0 The first pointer
     * @param {PointerEvent} p1 The second pointer
     * @returns {number} The distance between the two pointers
     */
    calculatePointersDistance = (p0, p1) => {

        return Math.sqrt(Math.pow(p1.clientX - p0.clientX, 2) + Math.pow(p1.clientY - p0.clientY, 2));

    };

    /**
     * Update a PointerEvent inside current pointerevents array
     * @param {PointerEvent} event
     */
    updateTouchEvent = (event) => {
        for (let i = 0; i < this._touchCurrent.length; i++) {
            if (this._touchCurrent[i].pointerId == event.pointerId) {
                this._touchCurrent.splice(i, 1, event);
                break;
            }
        }
    };

    dispose() {

        this.domElement.removeEventListener('pointerdown', this._onPointerDown);
        this.domElement.removeEventListener('pointermove', this._onPointerHover);
        this.domElement.removeEventListener('pointermove', this._onPointerMove);
        this.domElement.removeEventListener('pointerup', this._onPointerUp);

        this.traverse(function(child) {

            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();

        });

    }

    // Set current object
    attach(object) {

        this.object = object;
        this.visible = true;

        this._quaternionDefault.copy(this.object.quaternion);
        this._scaleDefault.copy(this.object.scale);

        return this;

    }

    // Detach from object
    detach() {

        this.object = undefined;
        this.visible = false;
        this.axis = null;

        return this;

    }

    reset() {
        
        if (!this.enabled) return;

        if (this.dragging) {

            this.object.position.copy(this._positionStart);
            this.object.quaternion.copy(this._quaternionStart);
            this.object.scale.copy(this._scaleStart);

            this.dispatchEvent(_changeEvent);
            this.dispatchEvent(_objectChangeEvent);

            this.pointStart.copy(this.pointEnd);

        }
    }

    resetTransform() {
        //this.object.position.copy(this._positionStart);   // Let it be at the spawned position
        this.object.quaternion.copy(this._quaternionDefault);
        this.object.scale.copy(this._scaleDefault);
 
    }

    getRaycaster() {
        return _raycaster;

    }

    // TODO: deprecate

    getMode() {

        return this.mode;

    }

    setMode(mode) {

        this.mode = mode;

    }

    setTranslationSnap(translationSnap) {

        this.translationSnap = translationSnap;

    }

    setRotationSnap(rotationSnap) {

        this.rotationSnap = rotationSnap;

    }

    setScaleSnap(scaleSnap) {

        this.scaleSnap = scaleSnap;

    }

    setSize(size) {

        this.size = size;

    }

    setSpace(space) {

        this.space = space;

    }

}

// mouse / touch event handlers

function getPointer(event) {

    if (this.domElement.ownerDocument.pointerLockElement) {

        return {
            x: 0,
            y: 0,
            button: event.button,
            touch: event.touches
        };

    } else {

        const rect = this.domElement.getBoundingClientRect();

        return {
            x: (event.clientX - rect.left) / rect.width * 2 - 1,
            y: - (event.clientY - rect.top) / rect.height * 2 + 1,
            button: event.button,
            touch: event.touches
        };

    }

}

function onPointerHover(event) {

    if (!this.enabled) return;

    switch (event.pointerType) {

        case 'mouse':
        case 'pen':
            this.pointerHover(this._getPointer(event));
            break;

    }

}

function onPointerDown(event) {

    if (!this.enabled) return;

    if (!document.pointerLockElement) {

        this.domElement.setPointerCapture(event.pointerId);

    }

    this.domElement.addEventListener('pointermove', this._onPointerMove);

    this.pointerHover(this._getPointer(event));
    //this.pointerDown(this._getPointer(event));
    this.pointerDown(event);

}

function onPointerMove(event) {

    if (!this.enabled) return;

    //this.pointerMove(this._getPointer(event));
    this.pointerMove(event);

}

function onPointerUp(event) {

    if (!this.enabled) return;

    this.domElement.releasePointerCapture(event.pointerId);

    this.domElement.removeEventListener('pointermove', this._onPointerMove);

    //this.pointerUp(this._getPointer(event));
    this.pointerUp(event);

}

function intersectObjectWithRay(object, raycaster, includeInvisible) {

    const allIntersections = raycaster.intersectObject(object, true);

    for (let i = 0; i < allIntersections.length; i++) {

        if (allIntersections[i].object.visible || includeInvisible) {

            return allIntersections[i];

        }

    }

    return false;

}

//

// Reusable utility variables

const _tempEuler = new Euler();
const _alignVector = new Vector3(0, 1, 0);
const _zeroVector = new Vector3(0, 0, 0);
const _lookAtMatrix = new Matrix4();
const _tempQuaternion2 = new Quaternion();
const _identityQuaternion = new Quaternion();
const _dirVector = new Vector3();
const _tempMatrix = new Matrix4();

const _unitX = new Vector3(1, 0, 0);
const _unitY = new Vector3(0, 1, 0);
const _unitZ = new Vector3(0, 0, 1);

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();

//
class TransformControlsPlane extends Mesh {

    constructor() {

        super(
            new PlaneGeometry(100000, 100000, 2, 2),
            new MeshBasicMaterial({ visible: false, wireframe: true, side: DoubleSide, transparent: true, opacity: 0.1, toneMapped: false })
        );

        this.isTransformControlsPlane = true;

        this.type = 'TransformControlsPlane';

    }

    updateMatrixWorld(force) {

        let space = this.space;

        this.position.copy(this.worldPosition);

        if (this.mode === 'scale') space = 'local'; // scale always oriented to local rotation

        _v1.copy(_unitX).applyQuaternion(space === 'local' ? this.worldQuaternion : _identityQuaternion);
        _v2.copy(_unitY).applyQuaternion(space === 'local' ? this.worldQuaternion : _identityQuaternion);
        _v3.copy(_unitZ).applyQuaternion(space === 'local' ? this.worldQuaternion : _identityQuaternion);

        // Align the plane for current transform mode, axis and space.

        _alignVector.copy(_v2);

        switch (this.mode) {

            case 'translate':
            case 'scale':
                switch (this.axis) {

                    case 'X':
                        _alignVector.copy(this.eye).cross(_v1);
                        _dirVector.copy(_v1).cross(_alignVector);
                        break;
                    case 'Y':
                        _alignVector.copy(this.eye).cross(_v2);
                        _dirVector.copy(_v2).cross(_alignVector);
                        break;
                    case 'Z':
                        _alignVector.copy(this.eye).cross(_v3);
                        _dirVector.copy(_v3).cross(_alignVector);
                        break;
                    case 'XY':
                        _dirVector.copy(_v3);
                        break;
                    case 'YZ':
                        _dirVector.copy(_v1);
                        break;
                    case 'XZ':
                        _alignVector.copy(_v3);
                        _dirVector.copy(_v2);
                        break;
                    case 'XYZ':
                    case 'E':
                        _dirVector.set(0, 0, 0);
                        break;

                }

                break;
            case 'rotate':
            default:
                // special case for rotate
                _dirVector.set(0, 0, 0);

        }

        if (_dirVector.length() === 0) {

            // If in rotate mode, make the plane parallel to camera
            this.quaternion.copy(this.cameraQuaternion);

        } else {

            _tempMatrix.lookAt(_tempVector.set(0, 0, 0), _dirVector, _alignVector);

            this.quaternion.setFromRotationMatrix(_tempMatrix);

        }

        super.updateMatrixWorld(force);

    }

}

export { TransformControls, TransformControlsPlane };
