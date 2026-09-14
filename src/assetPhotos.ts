import type { Asset } from './App'

export const materialPhotos = [
  ['EMX-STE-240901', '4/40/I-Beam_002.JPG/500px-I-Beam_002.JPG', 'Todd Murray', 'CC BY-SA 3.0', 'I-Beam_002.JPG'],
  ['EMX-WOD-240902', 'd/da/Track%2C_Cattle_Grid_and_Lumber_Stack_at_North_Plantation_-_geograph.org.uk_-_5176324.jpg/500px-Track%2C_Cattle_Grid_and_Lumber_Stack_at_North_Plantation_-_geograph.org.uk_-_5176324.jpg', 'Peter Wood', 'CC BY-SA 2.0', 'Track,_Cattle_Grid_and_Lumber_Stack_at_North_Plantation_-_geograph.org.uk_-_5176324.jpg'],
  ['EMX-PIP-240827', 'a/a7/120_inch_HDPE_pipe_installation.jpg/500px-120_inch_HDPE_pipe_installation.jpg', 'Tomascastelazo', 'CC BY-SA 4.0', '120_inch_HDPE_pipe_installation.jpg'],
  ['EMX-CON-240908', '0/03/Concrete-block%2Cjapan.JPG/500px-Concrete-block%2Cjapan.JPG', 'katorisi', 'CC BY 2.5', 'Concrete-block,japan.JPG'],
  ['EMX-REB-240906', '5/59/A_bunch_of_rebar_up_close.jpg/500px-A_bunch_of_rebar_up_close.jpg', 'W.carter', 'CC BY-SA 4.0', 'A_bunch_of_rebar_up_close.jpg'],
]

export function prepareAssets(assets: Asset[]) {
  return assets.map((asset) => {
    const photo = materialPhotos.find(([code]) => code === asset.code)
    return { ...asset, image: photo ? `https://thumb.wikimedia.org/wikipedia/commons/thumb/${photo[1]}` : asset.image }
  })
}