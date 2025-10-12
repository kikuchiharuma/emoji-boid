attribute float aBirdIndex;
uniform sampler2D texturePosition;
uniform float uWidth;
varying float vBirdIndex;

void main() {
    vec2 uv = vec2(mod(float(gl_InstanceID), uWidth), floor(float(gl_InstanceID) / uWidth)) / uWidth;
    vec4 pos = texture2D(texturePosition, uv);
    vBirdIndex = aBirdIndex;
    vec4 modelViewPosition = modelViewMatrix * vec4(pos.xyz, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;

    // 1. カメラからの距離を計算
    // modelViewPosition.z はビュー座標系での深度を表す（負の値）
    float distance = -modelViewPosition.z;

    // 2. 基本サイズを距離で割ることで、遠くのものほど小さくする
    // 値は、どのくらい小さくするかを調整する係数
    gl_PointSize = 8000.0 / distance;
}