export type Position = readonly [number, number];
export type Geometry = Readonly<{ type: "Polygon"; coordinates: readonly (readonly Position[])[] }> | Readonly<{ type: "MultiPolygon"; coordinates: readonly (readonly (readonly Position[])[])[] }>;
export type DisplayRotationDegrees = 0|90|180|270;
export interface ReferenceEntry { readonly id:string; readonly assetId:string; readonly sourceId:string; readonly regionId:string; readonly sourceEraId:string; readonly sourceDateDisplayJa:string; readonly historicalPeriodJa:string; readonly titleJa:string; readonly promptLabelJa:string; readonly descriptionJa:string; readonly altJa:string; readonly image:Readonly<{publicPath:string;mimeType:string;width:number;height:number;bytes:number;sha256:string}>; readonly displayRotationDegrees:DisplayRotationDegrees; readonly trigger:Readonly<{geometry:Geometry;zoom:Readonly<{minimum:number;maximum:number;enterDetailAt:number;leaveDetailBelow:number}>}>; readonly priority:number; readonly attributionJa:string; readonly derivativeDisclosureJa:string; readonly sourceUrl:string; readonly licenseCode:string; readonly licenseUrl:string; readonly cautionJa:string }

export interface ReferenceImageLayout {
  readonly sourceWidth:number;
  readonly sourceHeight:number;
  readonly displayWidth:number;
  readonly displayHeight:number;
}

export function calculateReferenceImageLayout(
  sourceWidth:number,
  sourceHeight:number,
  displayRotationDegrees:DisplayRotationDegrees,
  availableWidth:number,
  availableHeight:number,
  zoomScale:number,
):ReferenceImageLayout|null {
  if(![sourceWidth,sourceHeight,availableWidth,availableHeight,zoomScale].every((value)=>Number.isFinite(value)&&value>0))return null;
  const swapsAxes=displayRotationDegrees===90||displayRotationDegrees===270;
  const orientedWidth=swapsAxes?sourceHeight:sourceWidth;
  const orientedHeight=swapsAxes?sourceWidth:sourceHeight;
  const fitScale=Math.min(availableWidth/orientedWidth,availableHeight/orientedHeight);
  const scale=fitScale*zoomScale;
  return {
    sourceWidth:sourceWidth*scale,
    sourceHeight:sourceHeight*scale,
    displayWidth:orientedWidth*scale,
    displayHeight:orientedHeight*scale,
  };
}

const onSegment=(p:Position,a:Position,b:Position):boolean=>{const cross=(p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]);return Math.abs(cross)<1e-10&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);};
function inRing(point:Position,ring:readonly Position[]):boolean { let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j]!,b=ring[i]!;if(onSegment(point,a,b))return true;if(((a[1]>point[1])!==(b[1]>point[1]))&&(point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside;} return inside; }
function inPolygon(point:Position,polygon:readonly (readonly Position[])[]):boolean{return polygon.length>0&&inRing(point,polygon[0]!)&&!polygon.slice(1).some((ring)=>inRing(point,ring));}
export function pointInGeometry(point:Position,geometry:Geometry):boolean{return geometry.type==="Polygon"?inPolygon(point,geometry.coordinates):geometry.coordinates.some((polygon)=>inPolygon(point,polygon));}
export function selectReferenceEntry(entries:readonly ReferenceEntry[],state:Readonly<{regionId:string;center:Position;zoom:number;visibleId?:string|null}>):ReferenceEntry|null {return entries.filter((entry)=>entry.regionId===state.regionId&&pointInGeometry(state.center,entry.trigger.geometry)&&state.zoom>=(state.visibleId===entry.id?entry.trigger.zoom.leaveDetailBelow:entry.trigger.zoom.enterDetailAt)&&state.zoom<=entry.trigger.zoom.maximum).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))[0]??null;}
