// The alternative folded light-curtain background, driven by the same media clock.
export const curtainShader = `
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_deep_blue;
uniform vec3 u_cyan_rim;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+13.7;a*=.5;}return v;}
void main(){
 vec2 uv=gl_FragCoord.xy/u_resolution.xy;
 vec2 p=vec2((uv.x-.5)*u_resolution.x/u_resolution.y,uv.y);
 float t=u_time*.045;vec3 color=vec3(.002,.006,.016)+u_deep_blue*.025;
 for(int i=0;i<12;i++){
  float depth=float(i)/11.0,x=p.x*(1.0+depth*.45)+depth*.57;
  float warp=fbm(vec2(x*1.2+t*.18,depth*1.7+2.0));
  float fold=fbm(vec2(x*3.8+warp*3.0-t*.12,depth*2.3));
  float altitude=p.y-(.30+depth*.20+(warp-.5)*.27+(fold-.5)*.15);
  float fine=noise(vec2(x*115.0+fold*16.0,depth*5.0+t*.12));
  float striation=pow(noise(vec2(x*35.0+warp*8.0,depth*7.0)),2.0);
  float patches=smoothstep(.23,.7,fbm(vec2(x*2.0-t*.1,depth*3.0+4.0)));
  float height=.15+.34*noise(vec2(x*1.6,depth*4.0));
  float density=smoothstep(-.028,.045,altitude)*exp(-max(0.0,altitude)/height*3.8)*patches*(.16+striation*.84)*(.65+fine*.35);
  vec3 hue=mix(mix(vec3(.11,.79,.39),u_cyan_rim,.18),vec3(.26,.12,.38),smoothstep(.13,.45,altitude)*.65);
  color+=hue*density*.23;
 }
 vec2 grid=uv*vec2(420.0,260.0),cell=floor(grid),f=fract(grid)-.5;
 color+=vec3(.45,.57,.7)*step(.9975,hash(cell))*exp(-dot(f,f)*90.0)*.32;
 color*=.5+.5*(1.0-smoothstep(.25,.85,length((uv-.5)*vec2(.9,1.0))));
 gl_FragColor=vec4(1.0-exp(-color*1.65),1.0);
}`;
