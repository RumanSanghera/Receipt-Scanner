import { WhiteBalance } from 'expo-camera/build/Camera.types'
import { StyleSheet } from 'react-native'
//import { color } from 'react-native-reanimated'

export default StyleSheet.create({
  Colors:
  {
    primary: '#226B74',
    secondary: '#254B5A',
    tertiary: '#5DA6A7',
    darkLight: '#254B5A',
    brand: '#254B5A',
    green: '#254B5A',
    red: '#254B5A'
  },
  welcome:
  {
    justifyContent: 'center',
    flex: 1

  },
  centerText: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center'
  },
  homeButton: {
    borderRadius: 30,
    padding: 10,
    backgroundColor: 'dodgerblue'
  },
  buttonStyleDefault:
  {

    borderRadius: 30,
    padding: 25,
    marginHorizontal: 15,
    marginVertical: 10,
    backgroundColor: 'dodgerblue'

  },
  inputBox: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 10,
    margin: 5,
    fontWeight: '500'
  },

  buttonText:
{
  textAlign: 'center',
  color: 'white',
  fontWeight: '400'

},
  titleText: {
    fontWeight: 'bold',
    fontSize: 25,
    marginBottom: 20,
    textAlign: 'center'
  },
  searchBtn:
{
  borderRadius: 30,
  borderWidth: 2,
  padding: 10,
  marginHorizontal: 15,
  marginVertical: 10,
  borderColor: 'dodgerblue',
  backgroundColor: 'white'
},
  searchText:
{
  textAlign: 'center',
  color: 'black',
  fontWeight: '400'

},
  errorText:
{
  textAlign: 'center',
  fontWeight: '700',
  color: 'red'
},
  AcceptButton: {
    borderRadius: 30,
    padding: 10,
    marginHorizontal: 15,
    backgroundColor: 'green'
  },
  AcceptText: {
    textAlign: 'center',
    color: 'white',
    fontWeight: '400'
  },
  DeclineButton: {
    borderRadius: 30,
    padding: 10,
    marginHorizontal: 15,
    marginTop: 5,
    marginBottom: 15,
    backgroundColor: 'red'
  },
  DeclineText: {
    textAlign: 'center',
    color: 'white',
    fontWeight: '400'
  },
  button:
  {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 4,
    elevation: 3,
    backgroundColor: 'black',
    margin: 10,
  },
  text: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: 'bold',
    letterSpacing: 0.25,
    color: 'white',
  },
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22
  },
  modalView: {
    margin: 20,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 35,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  buttonOpen: {
    backgroundColor: "#F194FF",
  },
  buttonClose: {
    backgroundColor: "#2196F3",
  },
  textStyle: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center"
  },
  modalText: {
    marginBottom: 15,
    textAlign: "center"
  }

})
