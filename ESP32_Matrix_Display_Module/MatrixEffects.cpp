#include "MatrixEffects.h"

#include <math.h>

namespace Matrix {
namespace {
constexpr float PI_F = 3.14159265358979323846f;
constexpr float TAU = PI_F * 2;

float wrap(float a, float b) { const float r = fmodf(a, b); return r < 0 ? r + b : r; }
float clamp(float v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
float noise(int32_t n) {
  return ((uint32_t(n) * 1664525UL + 1013904223UL) >> 8 & 65535UL) / 65535.0f;
}
float squared(float v) { return v * v; }
bool spot(float x, float y, float cx, float cy, float r) { return squared(x-cx)+squared(y-cy)<=r*r; }
float tri(float t, float range) { return range - fabsf(wrap(t,range*2)-range); }
Color scale(Color c, float v) {
  v = clamp(v);
  return {uint8_t(lroundf(c.red*v)),uint8_t(lroundf(c.green*v)),uint8_t(lroundf(c.blue*v))};
}
Color hsv(float h, float s, float v) {
  h = wrap(h,1)*6; s=clamp(s); v=clamp(v);
  const int i = int(h);
  const float f=h-i,p=v*(1-s),q=v*(1-f*s),r=v*(1-(1-f)*s);
  float red,green,blue;
  switch(i) {
    case 0:red=v;green=r;blue=p;break;
    case 1:red=q;green=v;blue=p;break;
    case 2:red=p;green=v;blue=r;break;
    case 3:red=p;green=q;blue=v;break;
    case 4:red=r;green=p;blue=v;break;
    default:red=v;green=p;blue=q;break;
  }
  return {uint8_t(lroundf(red*255)),uint8_t(lroundf(green*255)),uint8_t(lroundf(blue*255))};
}

Color effectPixel(uint8_t id, int x, int y, float t, Color c) {
  const float dx=x-9.5f,dy=y-7.0f,d=hypotf(dx,dy),a=atan2f(dy,dx),n=noise(x+y*WIDTH);
  float v=0,h=0;
  switch(id) {
    case 0:return hsv(x/20.0f+t*.12f,1,1);
    case 1:return hsv(y/15.0f-t*.1f,.9f,1);
    case 2:return hsv((x+y)/18.0f-t*.15f,1,1);
    case 3:return hsv(d/9-t*.14f,1,1);
    case 4:return hsv(a/TAU+d*.07f-t*.15f,1,1);
    case 5:return hsv(t*.08f,.8f,.25f+.75f*(.5f+.5f*sinf(t*2)));
    case 6:return hsv(.5f+.25f*sinf(x*.3f+t)+.25f*cosf(y*.45f-t),.9f,.9f);
    case 7:return hsv((sinf(x*.3f+t)+sinf(y*.4f-t)+sinf((x+y)*.2f+t*.7f))/6+t*.04f,1,1);
    case 8:v=clamp(1-fabsf(y-(5+3*sinf(x*.3f+t)))/5);return hsv(.32f+.25f*sinf(x*.2f+t*.4f),.9f,v*.85f);
    case 9:return hsv((x/3+y/3)/8.0f+t*.1f,.85f,.35f+.65f*((x/3+y/3+int(floorf(t)))%2));
    case 10:v=powf(.5f+.5f*cosf(d*1.6f-t*3),10);return scale(c,v);
    case 11:v=(sinf(hypotf(x-3,y-3)*1.3f-t*3)+sinf(hypotf(x-16,y-4)*1.2f-t*2.7f)+sinf(hypotf(x-10,y-13)*1.4f-t*3.2f)+3)/6;return hsv(.5f+v*.2f,.8f,v);
    case 12:v=d<7?expf(-wrap(t-a,TAU)*2)*(.3f+.7f*d/7):0;return scale(c,v);
    case 13:v=fminf(fabsf(dx*cosf(t)+dy*sinf(t)),fabsf(-dx*sinf(t)+dy*cosf(t)))<.7f?1:0;return scale(c,v);
    case 14:v=((x/3+y/3)%2)?(.5f+.5f*sinf(t*2)):(.5f-.5f*sinf(t*2));return scale(c,v);
    case 15:return scale(c,wrap(x-t*4,5)<2?1:.04f);
    case 16:v=powf(.5f+.5f*cosf((fabsf(dx)+fabsf(dy))*1.2f-t*3),8);return hsv(t*.06f+d*.03f,.8f,v);
    case 17:v=wrap(fmaxf(fabsf(dx)*.75f,fabsf(dy))-t*2,3)<.8f?1:.02f;return hsv(d*.06f-t*.08f,.85f,v);
    case 18:v=fminf(wrap(x+2*sinf(y*.4f+t),5),wrap(y+1.5f*sinf(x*.3f-t),4))<.65f?1:.02f;return scale(c,v);
    case 19:h=cosf(a*6+t)+sinf(d*.7f-t*2);return hsv(h*.2f+t*.05f,.9f,.25f+.75f*(.5f+.5f*cosf(a*6-d+t)));
    case 20:v=wrap(wrap(t*6+noise(x)*15,15)-y,15);return v<3?scale(c,1-v/3):Color{0,0,0};
    case 21:v=wrap(wrap(t*(3+noise(x)*5)+noise(x+41)*15,15)-y,15);return v<6?hsv(.33f,.9f,1-v/6):Color{0,0,0};
    case 22:v=0;for(int i=0;i<18;i++)if(spot(x,y,wrap(noise(i)*20+sinf(t+i)*1.5f,20),wrap(noise(i+50)*15+t*(1+noise(i+10)),15),.55f))v=1;return scale({210,235,255},v);
    case 23:v=clamp((y/14.0f)*1.2f-noise(x+int(floorf(t*8))*21+(y/2)*37)*.55f+.18f*sinf(x*.7f+t*3));return hsv(.02f+v*.12f,1,v);
    case 24:v=.5f+.5f*sinf(y*.9f+x*.35f-t*2);return hsv(.55f+.08f*v,.9f,.15f+.65f*v);
    case 25:v=clamp(1-hypotf(dx*.45f,dy*.8f+2)/6)*(.65f+.25f*noise(int(floorf(t*12))));return hsv(.075f,.9f,v);
    case 26:v=n>.88f?powf(.5f+.5f*sinf(t*(1+n)+n*50),7):.015f;return hsv(.19f+n*.17f,.85f,v);
    case 27:v=n>.91f?.15f+.85f*powf(.5f+.5f*sinf(t*(1+n)+n*70),3):0;return hsv(.58f,.15f,v);
    case 28:v=wrap(x+y*.6f-t*5,10);return v<2?hsv(y*.03f+t*.08f,.45f,1-v/2):Color{0,0,0};
    case 29:{const bool pulse=int(floorf(t*2))%7==0&&wrap(t*2,1)<.22f;const float bolt=9+sinf(y*1.9f+floorf(t*2))*3;v=pulse&&(fabsf(x-bolt)<.8f||(y>7&&fabsf(x-bolt-(y-7))<.8f))?1:(pulse?.07f:0);return scale({200,220,255},v);}
    case 30:{const int index=y%2?y*20+19-x:y*20+x;const float head=wrap(t*7,300),age=wrap(head-index,300);return age<22?hsv(age*.04f+t*.04f,1,1-age/22):Color{0,0,0};}
    case 31:v=expf(-(squared(x-tri(t*4,19))+squared(y-tri(t*3,14)))/2);return scale(c,v);
    case 32:for(int i=0;i<3;i++)if(spot(x,y,9.5f+cosf(t+i*TAU/3)*(3+i*2),7+sinf(t+i*TAU/3)*(2+i*1.5f),1))return hsv(i/3.0f+t*.03f,.85f,1);return {0,0,0};
    case 33:{const float angle=sinf(t*1.8f)*.9f,cx=9.5f+sinf(angle)*6,cy=2+cosf(angle)*6;v=spot(x,y,cx,cy,1.2f)?1:(y>=2&&y<=cy&&fabsf(x-(9.5f+(y-2)*tanf(angle)))<.5f?.2f:0);return scale(c,v);}
    case 34:v=expf(-squared(x-tri(t*5,19))*1.2f);return scale(c,v);
    case 35:v=fminf(fabsf(y-(7+4*sinf(x*.4f-t*2))),fabsf(y-(7-4*sinf(x*.4f-t*2))));return v<1?hsv(y<7?t*.08f:.5f+t*.08f,1,1-v):Color{0,0,0};
    case 36:{const float phase=wrap(t,3),cx=3+noise(int(floorf(t/3)))*13,cy=3+noise(int(floorf(t/3))+5)*7,dist=hypotf(x-cx,y-cy);v=fabsf(dist-phase*3)<.8f&&noise(int(floorf(atan2f(y-cy,x-cx)*12))+int(floorf(t/3))*73)>.35f?clamp(1-phase/3):0;return hsv(floorf(t/3)*.17f,1,v);}
    case 37:for(int i=0;i<7;i++){const float phase=wrap(t+i*.14f,1.7f),cx=9.5f+(i-3)*phase*1.9f,cy=14-15*phase+9*phase*phase;if(spot(x,y,cx,cy,.7f))return hsv(.48f+i*.025f,.8f,1);}return {0,0,0};
    case 38:v=powf(.5f+.5f*cosf(a*2+d*.8f-t*3),9)*clamp(1-d/13);return hsv(a/TAU+t*.08f,1,v);
    case 39:{const float hx=wrap(t*5,30)-5,hy=4+sinf(t*.7f)*3,age=hx-x;v=age>=0&&age<8&&fabsf(y-(hy+age*.3f))<.7f?1-age/8:0;return scale({230,240,255},v);}
    case 40:{const float p=wrap(x-t*4,20),yy=p<6?7:p<8?7-(p-6)*2:p<10?3+(p-8)*4:p<12?11-(p-10)*2:7;v=fabsf(y-yy)<.65f?1:0;return scale(c,v);}
    case 41:{const int column=x/2,bar=2+int(floorf((.5f+.5f*sinf(t*2+column*.8f))*11));return y>=15-bar&&x%2==0?hsv((14-y)/20.0f,.95f,1):Color{0,0,0};}
    case 42:{const float bx=1+tri(t*5,17),by=tri(t*3,14);v=spot(x,y,bx,by,.7f)||((x==0||x==19)&&fabsf(y-(x==0?tri(t*2.3f,11)+1.5f:tri(t*2.7f+4,11)+1.5f))<2)?1:0;return scale(c,v);}
    case 43:{const int tile=x/2+(y/2)*10,seed=int(floorf(t*.8f));v=noise(tile+seed*71)>.73f?1:0;return hsv(noise(tile+seed*17),.85f,v);}
    case 44:{const float cx=3+tri(t*2,13),cy=3+tri(t*1.6f,8);const int xx=int(floorf(x-cx+.5f)),yy=int(floorf(y-cy+.5f));v=fabsf(hypotf(xx,yy)-3)<.5f||(yy==-1&&abs(xx)==1)||(yy==1&&abs(xx)==2)||(yy==2&&abs(xx)<2)?1:0;return scale({255,200,25},v);}
    case 45:{const int cx=int(floorf(wrap(t*3,24)))-2,xx=x-cx,pose=int(floorf(t*5))%2;v=(y==4&&abs(xx)<=1)||(y>=5&&y<=9&&xx==0)||(y==7&&abs(xx)<=2)||(y==10&&abs(xx)==1)||(y==11&&(xx==(pose?2:-2)||xx==(pose?-1:1)))?1:0;return y==13?scale(c,.2f):scale(c,v);}
    case 46:{bool bird=false;for(int i=0;i<3;i++){const float bx=wrap(t*3+i*7,26)-3,by=3+i*2+sinf(t+i);if(spot(x,y,bx,by,.6f)||(fabsf(y-(by+(int(floorf(t*5))%2?1:-1)))<.5f&&fabsf(fabsf(x-bx)-1)<.5f))bird=true;}const float treeX=wrap(x+t*2,7)-3;const bool tree=fabsf(treeX)<(y-8)*.45f&&y>8&&y<13;return bird?Color{240,240,255}:tree?Color{20,125,55}:y>=13?Color{25,65,25}:Color{0,4,12};}
    case 47:{const float ry=19-wrap(t*4,26),yy=y-ry;return yy>=0&&yy<=5&&fabsf(x-9.5f)<1.1f?Color{220,225,245}:yy>5&&yy<9&&fabsf(x-9.5f)<1.6f?hsv(.03f,.95f,.5f+.5f*noise(x+y*20+int(floorf(t*9)))):yy>-1&&yy<1&&fabsf(x-9.5f)<.7f?Color{255,70,70}:Color{0,0,0};}
    case 48:{const int lane=x/5,xx=x%5;const float head=wrap(t*(2+lane*.4f)+lane*4,20)-4,yy=y-head;v=yy>=0&&yy<3&&((yy<2&&xx>0&&xx<4)||(yy>=2&&xx==2))?1:0;return hsv(lane*.21f,.95f,v);}
    case 49:if(spot(x,y,9.5f,7,1.3f))return {255,190,35};for(int i=0;i<3;i++)if(spot(x,y,9.5f+cosf(t/(i+1)+i)*(3+i*2.3f),7+sinf(t/(i+1)+i)*(2+i*1.8f),.8f))return hsv(i*.28f+.3f,.8f,1);return {0,0,3};
    case 50:return scale(c,.1f+.9f*(.5f+.5f*sinf(t*1.3f)));
    case 51:v=.5f+.5f*sinf(x*.12f+y*.1f-t*.5f);return {uint8_t(lroundf(c.red*v+(255-c.red)*(1-v)*.55f)),uint8_t(lroundf(c.green*v+(255-c.green)*(1-v)*.55f)),uint8_t(lroundf(c.blue*v+(255-c.blue)*(1-v)*.55f))};
    case 52:v=0;for(int i=0;i<3;i++)v+=expf(-(squared(x-(9.5f+sinf(t*.6f+i*2)*6))+squared(y-(7+cosf(t*.4f+i*2)*4)))/14);return hsv(.02f+.12f*clamp(v),.9f,clamp(v)*.9f);
    case 53:v=(sinf(x*.2f+t*.3f)+cosf(y*.3f-t*.4f)+sinf((x+y)*.18f-t*.2f)+3)/6;return hsv(.62f+v*.2f,.8f,v*.45f);
    case 54:v=n>.82f?powf(.5f+.5f*sinf(t*3+n*100),12):.015f;return scale(c,v);
    case 55:return y<9?hsv(.03f+(y/9.0f)*.09f,.85f,.35f+.45f*(.5f+.5f*sinf(t*.3f))):hsv(.78f,.7f,.15f+.15f*sinf(x*.8f+y-t*2));
    case 56:v=wrap(wrap(14-t*(1+noise(x)*2)+noise(x+8)*15,15)-y,15);return hsv(.01f+.05f*(y/14.0f),1,v<2?(1-v/2)*(y/14.0f):.015f*(y/14.0f));
    case 57:{const float yy=y+sinf(x*.35f-t*2)*1.5f;return yy<5?Color{245,135,30}:yy<10?Color{220,235,245}:Color{25,155,75};}
    case 58:{const int xx=int(floorf(x+t*3)),col=xx/4,row=y/6,gy=y%6,gx=xx%4;const bool digit=noise(col+row*93)>.5f;const uint8_t zero[5]={7,5,5,5,7},one[5]={2,6,2,2,7};const uint8_t *glyph=digit?one:zero;v=gy<5&&gx<3&&(glyph[gy]&(4>>gx))?1:0;return scale({30,230,95},v);}
    case 59:{const uint8_t choices[6]={0,20,7,30,37,46};return effectPixel(choices[int(floorf(t/6))%6],x,y,wrap(t,6),c);}
    default:return {0,0,0};
  }
}
}  // namespace

void renderEffect(Frame &frame, uint8_t id, float tSeconds, Color color) {
  for(int y=0;y<HEIGHT;++y)
    for(int x=0;x<WIDTH;++x)
      frame.pixels[y][x]=effectPixel(id,x,y,tSeconds,color);
}

}  // namespace Matrix
