/** Pure geometry only: one aspect-preserving mapping, shared by the picture and its named regions. */
export function fitRect(width,height,fit){
  if(fit==='contain'){const scale=Math.min(1600/width,900/height),dw=width*scale,dh=height*scale;return {sx:0,sy:0,sw:width,sh:height,dx:(1600-dw)/2,dy:(900-dh)/2,dw,dh};}
  const scale=Math.max(1600/width,900/height),sw=1600/scale,sh=900/scale;return {sx:(width-sw)/2,sy:(height-sh)/2,sw,sh,dx:0,dy:0,dw:1600,dh:900};
}
export function fittedBox(box,rect){const z=rect.dw/rect.sw;return [rect.dx+(box[0]-rect.sx)*z,rect.dy+(box[1]-rect.sy)*z,rect.dx+(box[2]-rect.sx)*z,rect.dy+(box[3]-rect.sy)*z];}
