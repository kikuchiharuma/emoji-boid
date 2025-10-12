uniform sampler2D tBirdAtlas;
uniform float uAtlasWidth;
varying float vBirdIndex;

void main() {
    // スプライト内の座標 (左上 0,0 -> 右下 1,1)
    vec2 pointUV = gl_PointCoord;
    
    // グリッドの一辺の長さ (例: 4.0)
    float atlasWidth = uAtlasWidth;
    
    // 1マスのサイズ (例: 1.0 / 4.0 = 0.25)
    float cellSize = 1.0 / atlasWidth;

    // どの絵文字を使うか
    float birdIndex = floor(vBirdIndex);
    
    // 絵文字の列と行を計算
    float col = mod(birdIndex, atlasWidth);
    float row = floor(birdIndex / atlasWidth);

    // ★★★ ここが修正の核心 ★★★
    // 1. pointUV を1マス分の大きさに縮小
    // 2. その縮小した座標に、目的のマスのオフセット (col * cellSize, row * cellSize) を加える
    vec2 uv = vec2(col * cellSize, row * cellSize) + pointUV * cellSize;
    
    vec4 color = texture2D(tBirdAtlas, uv);
    
    if (color.a < 0.1) discard;
    
    gl_FragColor = color;
}